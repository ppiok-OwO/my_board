import express from 'express';
import { prisma } from '../utils/prisma/index.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import authMiddleware from '../middlewares/auth.middleware.js';

/** 라우터 객체 생성 */
const router = express.Router();

/** 회원가입 API */
// 1. `email`, `password`, `name`, `age`, `gender`, `profileImage`를 **body**로 전달받습니다.(외부에 노출이 되면 안 되기 때문에)
// 2. 동일한 `email`을 가진 사용자가 있는지 확인합니다.
// 3. **Users** 테이블에 `email`, `password`를 이용해 사용자를 생성합니다.
// 4. **UserInfos** 테이블에 `name`, `age`, `gender`, `profileImage`를 이용해 사용자 정보를 생성합니다.

router.post('/sign-up', async (req, res, next) => {
  const { email, password, name, age, gender, profileImage } = req.body;

  // 중복되는 이메일이 존재하는지 검사
  const isExitUser = await prisma.users.findFirst({
    where: { email },
  });
  if (isExitUser) {
    return res.status(400).json({ message: '이미 존재하는 이메일입니다.' });
  }

  // 사용자 비밀번호를 암호화합니다.
  const hashedPassword = await bcrypt.hash(password, 10);

  // 유저 생성하기
  const user = await prisma.users.create({
    data: {
      email,
      password: hashedPassword,
    },
  });
  // 유저 정보 생성하기
  const userInfo = await prisma.userInfos.create({
    // 여기서 await를 실수로 빠트렸더니 userInfo에 새로운 레코드가 생성되지 않았다.ㅠㅠ
    data: {
      userId: user.userId, // 생성한 유저의 userId를 바탕으로 사용자 정보를 생성
      name,
      age,
      gender: gender.toUpperCase(),
      profileImage,
    },
  });

  return res.status(201).json({ message: '회원가입이 완료되었습니다.' });
});

/** 로그인 API */
// 1. `email`, `password`를 **body**로 전달받습니다.
// 2. 전달 받은 `email`에 해당하는 사용자가 있는지 확인합니다.
// 3. 전달 받은 `password`와 데이터베이스의 저장된 `password`를 bcrypt를 이용해 검증합니다.
// 4. 로그인에 성공한다면, 사용자에게 JWT를 발급합니다.
router.post('/sign-in', async (req, res, next) => {
  const { email, password } = req.body;
  const user = await prisma.users.findFirst({
    where: { email },
  });

  if (!user) {
    res.status(401).json({ message: '존재하지 않는 이메일입니다.' });
  } else if (!(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: '비밀번호가 일치하지 않습니다.' });
  }

  // 로그인에 성공하면, 사용자의 userId를 바탕으로 토큰을 생성한다.
  const token = jwt.sign({ userId: user.userId }, 'custom-secret-key'); // 데이터와 암호화 키

  // authotization쿠키에 Bearer 토큰을 담아서 유저에게 응답합니다.
  res.cookie('authorization', `Bearer ${token}`);
  return res.status(200).json({ message: '로그인 성공' });
});

/** 사용자 정보 조회 API */
// 1. 클라이언트가 **로그인된 사용자인지 검증**합니다. -> 사용자 인증 미들웨어로 위임하기
// 2. 사용자를 조회할 때, 1:1 관계를 맺고 있는 **Users**와 **UserInfos** 테이블을 조회합니다.
// 3. 조회한 사용자의 상세한 정보를 클라이언트에게 반환합니다.
router.get('/users', authMiddleware, async (req, res, next) => {
  const { userId } = req.user;

  const user = await prisma.users.findFirst({
    where: { userId: +userId }, // userId가 일치하는 레코드의 필드를 보도록 하겠다.
    select: {
      userId: true,
      email: true,
      createdAt: true,
      updatedAt: true,
      userInfos: {
        // 1:1 관계를 맺고있는 UserInfos 테이블을 조회합니다.
        select: {
          name: true,
          age: true,
          gender: true,
          profileImage: true,
        },
      },
    },
  });

  return res.status(200).json({ data: user });
});

export default router;
