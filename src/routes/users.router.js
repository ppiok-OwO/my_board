import express from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma/index.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import authMiddleware from '../middlewares/auth.middleware.js';

/** 라우터 인스턴스 생성 */
const router = express.Router();

/** 회원가입 API */
// 1. `email`, `password`, `name`, `age`, `gender`, `profileImage`를 **body**로 전달받습니다.(외부에 노출이 되면 안 되기 때문에)
// 2. 동일한 `email`을 가진 사용자가 있는지 확인합니다.
// 3. **Users** 테이블에 `email`, `password`를 이용해 사용자를 생성합니다.
// 4. **UserInfos** 테이블에 `name`, `age`, `gender`, `profileImage`를 이용해 사용자 정보를 생성합니다.
router.post('/sign-up', async (req, res, next) => {
  const { email, password, name, age, gender, profileImage } = req.body;

  try {
    // 중복되는 이메일이 존재하는지 검사
    const isExitUser = await prisma.users.findFirst({
      where: { email },
    });
    if (isExitUser) {
      return res.status(400).json({ message: '이미 존재하는 이메일입니다.' });
    }

    // 사용자 비밀번호를 암호화합니다.
    const hashedPassword = await bcrypt.hash(password, 10);

    const [user, userInfo] = await prisma.$transaction(
      async (tx) => {
        // 유저 생성하기
        const user = await tx.users.create({
          data: {
            email,
            password: hashedPassword,
          },
        });

        // throw new Error('고의로 발생시킨 트랜젝션 에러!');

        // 유저 정보 생성하기
        const userInfo = await tx.userInfos.create({
          // 여기서 await를 실수로 빠트렸더니 userInfo에 새로운 레코드가 생성되지 않았다.ㅠㅠ
          // -> 이 문제는 트랜잭션을 통해 관리할 수 있다.
          data: {
            userId: user.userId, // 생성한 유저의 userId를 바탕으로 사용자 정보를 생성
            name,
            age,
            gender: gender.toUpperCase(),
            profileImage,
          },
        });

        return [user, userInfo];
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    return res.status(201).json({ message: '회원가입이 완료되었습니다.' });
  } catch (err) {
    next(err);
  }
});

/** Express-Session 로그인 API */
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

  // 로그인에 성공하면, 사용자의 userId를 바탕으로 세션을 생성합니다.
  req.session.userId = user.userId;
  
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

/** 사용자 정보 변경 API */
// 1. 클라이언트가 로그인된 사용자인지 검증합니다.
// 2. 변경할 사용자 정보 `name`, `age`, `gender`, `profileImage`를 **body**로 전달받습니다.
// 3. **사용자 정보(UserInofes) 테이블**에서 **사용자의 정보들**을 수정합니다.
// 4. 사용자의 **변경된 정보 이력**을 **사용자 히스토리(UserHistories)** 테이블에 저장합니다.
// 5. 사용자 정보 변경 API를 완료합니다.
router.patch('/users', authMiddleware, async (req, res, next) => {
  const { userId } = req.user;
  const updatedData = req.body;
  try {
    const userInfo = await prisma.userInfos.findFirst({
      where: { userId: +userId },
    });
    await prisma.$transaction(
      async (tx) => {
        // 사용자 정보 테이블 수정
        await tx.userInfos.update({
          where: { userId: userInfo.userId },
          data: {
            ...updatedData,
          },
        });

        // 사용자 히스토리 테이블 생성
        for (let key in updatedData) {
          if (userInfo[key] !== updatedData[key])
            await tx.userHistories.create({
              data: {
                userId: +userId,
                changedField: key,
                oldValue: String(userInfo[key]),
                newValue: String(updatedData[key]),
              },
            });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    return res
      .status(200)
      .json({ message: '사용자 정보 변경에 성공하였습니다.' });
  } catch (err) {
    next(err);
  }
});

export default router;
