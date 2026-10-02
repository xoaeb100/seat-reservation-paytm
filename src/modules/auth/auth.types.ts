import { Request } from 'express';

export type AuthUser = {
  id: string;
  role: 'user' | 'admin';
};

export type AuthenticatedRequest = Request & {
  user: AuthUser;
};
