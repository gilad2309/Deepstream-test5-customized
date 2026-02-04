export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

export interface StatusResponse {
  running: boolean;
  pid?: number | null;
}
