export interface CheckInActionsInput {
  sessionId: string;
  checkInId: string;
}

export interface UpdateCheckInActionInput {
  sessionId: string;
  actionId: string;
  status: 'acknowledged' | 'completed' | 'dismissed';
}
