import { createParamDecorator, ExecutionContext } from '@nestjs/common';

type JwtUser = {
  userId: string;
  email: string;
  name?: string;
  exp?: number;
};

export const User = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = (request.user ?? {}) as JwtUser;
    return data ? (user as any)[data] : user;
  },
);
