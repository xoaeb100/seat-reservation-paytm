import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedRequest } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers['authorization'];

    if (!authorization) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization header');
    }

    const adminToken = this.configService.getOrThrow<string>('ADMIN_TOKEN');

    if (token === adminToken) {
      request.user = {
        id: 'admin',
        role: 'admin',
      };

      return true;
    }

    if (!token.startsWith('user-') || token.length <= 5) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    request.user = {
      id: token,
      role: 'user',
    };

    return true;
  }
}
