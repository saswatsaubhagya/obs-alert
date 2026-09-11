import { handleAlertRequest } from '@/lib/apiAlert';

export async function POST(req: Request) {
  return handleAlertRequest(req);
}
