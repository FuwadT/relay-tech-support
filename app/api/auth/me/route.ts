import { getChatGPTUser } from '../../../chatgpt-auth';
import type { UserProfile } from '../../../../lib/contracts';

export async function GET(request: Request) {
  const authUser = await getChatGPTUser(request);
  if (!authUser) {
    return Response.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const user: UserProfile = {
    userId: authUser.userId,
    email: authUser.email,
    displayName: authUser.displayName,
    fullName: authUser.fullName,
    role: authUser.role,
  };

  return Response.json(
    { user },
    {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    }
  );
}
