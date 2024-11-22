import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma/index.js';

/** 사용자 인증 미들웨어 */
// 💡 **[게시판 프로젝트] 사용자 인증 미들웨어 비즈니스 로직**

// 1. 클라이언트로 부터 **쿠키(Cookie)**를 전달받습니다.
// 2. **쿠키(Cookie)**가 **Bearer 토큰** 형식인지 확인합니다.
// 3. 서버에서 발급한 **JWT가 맞는지 검증**합니다.
// 4. JWT의 `userId`를 이용해 사용자를 조회합니다.
// 5. `req.user` 에 조회된 사용자 정보를 할당합니다.
// 6. 다음 미들웨어를 실행합니다.

export default async function (req, res, next) {
  try {
    const { authorization } = req.cookies;
    if (!authorization)
      throw new Error('요청한 사용자의 토큰이 존재하지 않습니다.');

    // 쿠키로 전달된 authorization토큰은 Bearer ${token}의 형식을 가지고 있으므로 구조 분해 할당을 통해 배열의 형태로 변수에 할당해준다.
    const [tokenType, token] = authorization.split(' ');
    if (tokenType !== 'Bearer')
      throw new Error('토큰 타입이 Bearer형식이 아닙니다.');

    const decodedToken = jwt.verify(token, 'custom-secret-key'); // verify에 성공하면 복호화된 데이터가 변수에 할당되고, 실패하면 error가 발생한다.
    const userId = decodedToken.userId;

    const user = await prisma.users.findFirst({
      where: { userId: +userId },
    });

    if (!user) throw new Error('토큰 사용자가 존재하지 않습니다!');

    // req.user에 사용자 정보를 저장합니다.
    req.user = user;

    next();
  } catch (error) {
    res.clearCookie('authorization');

    // 토큰이 만료되었거나, 조작되었을 때, 에러 메시지를 다르게 출력합니다.
    switch (error.name) {
      case 'TokenExpiredError':
        return res.status(401).json({ message: '토큰이 만료되었습니다.' });
      case 'JsonWebTokenError':
        return res.status(401).json({ message: '토큰이 조작되었습니다.' });
      default:
        return res
          .status(401)
          .json({ message: error.message ?? '비정상적인 요청입니다.' });
    }
  }
}
