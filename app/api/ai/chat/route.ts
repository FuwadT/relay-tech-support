import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { cases } from '@/db/schema';
import { apiError } from '@/lib/case-store';
import { evaluateUserPrompt } from '@/lib/ai-telemetry';
import { getOneLinerCommand } from '@/lib/collector-templates';
import type { SupportedOS } from '@/lib/contracts';

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  const currentUserId = user?.userId || 'user-anonymous';

  try {
    const body = (await request.json().catch(() => ({}))) as {
      message?: string;
      caseId?: string;
      os?: SupportedOS;
    };

    const message = (body.message || '').trim();
    if (!message) {
      return Response.json({ error: 'Please describe your issue.' }, { status: 400 });
    }

    const preferredOs: SupportedOS = body.os || 'windows';
    const evaluation = evaluateUserPrompt(message);

    // Determine target case
    let activeCaseId = body.caseId;
    const now = new Date().toISOString();

    const origin = new URL(request.url).origin;

    if (!activeCaseId) {
      activeCaseId = `case-${crypto.randomUUID().slice(0, 8)}`;
      const newCaseRow = {
        id: activeCaseId,
        userId: currentUserId,
        title: message.length > 55 ? `${message.slice(0, 52)}...` : message,
        description: message,
        deviceName: preferredOs === 'macos' ? 'MacBook Pro' : preferredOs === 'linux' ? 'Linux Workstation' : 'Windows 11 PC',
        category: evaluation.category,
        os: 'windows11' as const,
        ownership: 'personal' as const,
        status: 'open' as const,
        answers: {},
        measurements: {},
        ruleVersion: '1.0.0',
        analysisSnapshot: {
          headline: evaluation.investigationPlan?.title || 'Conversational Support Session',
          summary: evaluation.conversationalResponse,
          findings: evaluation.quickFixSteps || evaluation.investigationPlan?.checksToPerform || [],
          nextSteps: evaluation.quickFixSteps || ['Run read-only diagnostic collector in terminal'],
          limitations: ['Zero-install and read-only telemetry triage active'],
          ruleVersion: '2.0.0',
          evidenceUsed: evaluation.detectedKeywords,
        },
        notes: `User: ${message}`,
        internalNotes: `Auto-triage created via AI chat. Zero-install possible: ${evaluation.canResolveZeroInstall}`,
        assignedTo: null,
        escalatedAt: null,
        consent: true,
        consentAt: now,
        createdAt: now,
        updatedAt: now,
        verifiedAt: null,
      };

      try {
        await getDb().insert(cases).values(newCaseRow);
      } catch (dbErr) {
        // In local mock or edge environment, proceed gracefully
        console.warn('Could not persist case to D1, continuing session in-memory', dbErr);
      }
    }

    const collectorCommands: Record<SupportedOS, string> = {
      windows: getOneLinerCommand('windows', activeCaseId, origin),
      macos: getOneLinerCommand('macos', activeCaseId, origin),
      linux: getOneLinerCommand('linux', activeCaseId, origin),
    };

    if (evaluation.canResolveZeroInstall) {
      return Response.json({
        caseId: activeCaseId,
        message: evaluation.conversationalResponse,
        cardType: 'quick-fix',
        cardData: {
          quickFixSteps: evaluation.quickFixSteps,
        },
      });
    }

    return Response.json({
      caseId: activeCaseId,
      message: evaluation.conversationalResponse,
      cardType: 'collector',
      cardData: {
        investigationPlan: evaluation.investigationPlan,
        collectorCommand: collectorCommands,
      },
    });
  } catch (error) {
    return apiError(error, 'ai_explanation');
  }
}
