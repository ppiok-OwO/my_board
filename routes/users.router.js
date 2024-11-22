import express from 'express';
import { prisma } from '../src/utils/prisma/index.js';

/** 라우터 객체 생성 */
const router = express.Router();

/** 회원가입 API */
// 💡 **[게시판 프로젝트] 회원가입 API 비즈니스 로직**
// 1. `email`, `password`, `name`, `age`, `gender`, `profileImage`를 **body**로 전달받습니다.(외부에 노출이 되면 안 되기 때문에)
// 2. 동일한 `email`을 가진 사용자가 있는지 확인합니다.
// 3. **Users** 테이블에 `email`, `password`를 이용해 사용자를 생성합니다.
// 4. **UserInfos** 테이블에 `name`, `age`, `gender`, `profileImage`를 이용해 사용자 정보를 생성합니다.

router.post('/sign-up', async (req, res, next) => {
  const { email, password, name, age, gender, profileImage } = req.body;

  const isExitUser = await prisma.users.findFirst({
    where: { email },
  });

  if (isExitUser) {
    return res.status(400).json({ message: '이미 존재하는 이메일입니다.' });
  }

  // 유저 생성하기
  const user = await prisma.users.create({
    data: {
      email,
      password,
    },
  });
  // 유저 정보 생성하기
  const userInfo = prisma.userInfos.create({
    data: {
      userId: user.userId, // 생성한 유저의 userId를 바탕으로 사용자 정보를 생성
      name,
      age,
      gender: gender.toUpperCase,
      profileImage,
    },
  });

  return res.status(201).json({ message: '회원가입이 완료되었습니다.' });
});

export default router;
