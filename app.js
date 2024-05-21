const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const pathDir = path.join(__dirname, 'twitterClone.db')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const app = express()
app.use(express.json())

let db = null

const intializeDbAndServer = async () => {
  try {
    db = await open({
      filename: pathDir,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running on http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB error : '${e.message}'`)
    process.exit(1)
  }
}

intializeDbAndServer()

//API 1 : Register

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getRegisterDetailsQuery = `SELECT * FROM user 
    WHERE username = '${username}';`
  const dbUser = await db.get(getRegisterDetailsQuery)
  if (dbUser !== undefined) {
    response.status(400)
    return response.send('User already exists')
  }
  if (password.length < 6) {
    response.status(400)
    return response.send('Password is too short')
  } else {
    const hashedPassword = await bcrypt.hash(password, 10)
    const registerUserQuery = `INSERT INTO user
    (username,password,name,gender)
    VALUES ('${username}','${hashedPassword}',
    '${name}','${gender}');`
    await db.run(registerUserQuery)
    response.status(200)
    response.send('User created successfully')
  }
})

//API 2 : LOGIN

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const loginQuery = `SELECT * FROM user 
  WHERE username = '${username}';`
  const dbLogin = await db.get(loginQuery)
  if (dbLogin === undefined) {
    response.status(400)
    return response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbLogin.password)
    if (isPasswordMatched === true) {
      const payLoad = {username: username, userId: dbLogin.user_id}
      const jwtToken = jwt.sign(payLoad, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//Authenticate With JWT Token
const authenticateToken = (request, response, next) => {
  const authHeaders = request.headers['authorization']
  let jwtToken
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payLoad) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payLoad.username
        request.userId = payLoad.userId
        next()
      }
    })
  }
}

//API 4

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  //USER ID

  const getUserIdQuery = `SELECT user_id FROM user
  WHERE username = '${username}';`
  const userId = await db.get(getUserIdQuery)

  //FOLLOWER ID

  const getFollowerIdQuery = `SELECT following_user_id FROM 
  follower WHERE follower_user_id = '${userId.user_id}'`
  const followerId = await db.all(getFollowerIdQuery)

  const getEachFollower = followerId.map(eachFollower => {
    return eachFollower.following_user_id
  })

  //RESULT

  const getUserTweetsQuery = `SELECT user.username,
  tweet.tweet,tweet.date_time AS dateTime
  FROM user INNER JOIN tweet
  ON user.user_id = tweet.user_id
  WHERE user.user_id IN (${getEachFollower})
  ORDER BY tweet.date_time DESC
  LIMIT 4;`

  const dbUserTweet = await db.all(getUserTweetsQuery)
  response.send(dbUserTweet)
})

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  //USER ID
  const getUserIdQuery = `SELECT user_id FROM user
  WHERE username = '${username}';`
  const userId = await db.get(getUserIdQuery)

  //FOLLOWER ID
  const getFollowerIdQuery = `SELECT following_user_id
  FROM follower WHERE follower_user_id = '${userId.user_id}';`
  const followerId = await db.all(getFollowerIdQuery)
  const getEachFollower = followerId.map(eachFollower => {
    return eachFollower.following_user_id
  })

  //RESULT
  const getUserFollowingQuery = `SELECT name 
  FROM user WHERE user_id IN (${getEachFollower});`
  const dbUserFollowing = await db.all(getUserFollowingQuery)
  response.send(dbUserFollowing)
})

//API 5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  //USER ID
  const getUserIdQuery = `SELECT user_id FROM user
  WHERE username = '${username}';`
  const userId = await db.get(getUserIdQuery)

  //FOLLOWER ID
  const getFollowerIdQuery = `SELECT follower_user_id
  FROM follower WHERE following_user_id = '${userId.user_id}';`
  const followerId = await db.all(getFollowerIdQuery)
  const getEachFollower = followerId.map(eachFollower => {
    return eachFollower.follower_user_id
  })

  //RESULT
  const getUserFollowingQuery = `SELECT name 
  FROM user WHERE user.user_id IN (${getEachFollower});`
  const dbUserFollowing = await db.all(getUserFollowingQuery)
  response.send(dbUserFollowing)
})

//TWITTER ACCESS
const twitterAccess = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params
  const getTweetFollowerQuery = `SELECT * FROM tweet
  INNER JOIN follower ON tweet.user_id =  follower.following_user_id
  WHERE tweet.tweet_id = '${tweetId}' AND 
  follower_user_id = '${userId}';`
  const tweet = await db.get(getTweetFollowerQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

app.get(
  '/tweets/:tweetId/',
  authenticateToken,
  twitterAccess,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const getTweetQuery = `SELECT tweet,
  (SELECT COUNT() FROM like WHERE tweet_id = '${tweetId}') AS likes,
  (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') AS replies,
  date_time AS dateTime 
  FROM tweet WHERE tweet.tweet_id = '${tweetId}';`
    const tweet = await db.get(getTweetQuery)
    response.send(tweet)
  },
)

app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  twitterAccess,
  async (request, response) => {
    const {tweetId} = request.params
    const getTweetLikesQuery = `SELECT username
  FROM user INNER JOIN like ON user.user_id = like.user_id
  WHERE tweet_id = '${tweetId}';`
    const liked = await db.all(getTweetLikesQuery)
    const usersName = liked.map(eachUser => {
      return eachUser.username
    })
    response.send({likes: usersName})
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  twitterAccess,
  async (request, response) => {
    const {tweetId} = request.params
    const getRepliesQuery = `SELECT name,reply.reply
  FROM user INNER JOIN reply ON user.user_id = reply.user_id
  WHERE tweet_id = '${tweetId}';`
    const replied = await db.all(getRepliesQuery)
    response.send({replies: replied})
  },
)

app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {userId} = request
  const getUserTweetsQuery = `SELECT tweet,
  COUNT(DISTINCT like_id) AS likes,
  COUNT(DISTINCT reply_id) AS replies,
  date_time AS dateTime
  FROM tweet LEFT JOIN reply ON  tweet.tweet_id = reply.tweet_id
  LEFT JOIN like ON tweet.tweet_id = like.tweet_id
  WHERE tweet.user_id = '${userId}'
  GROUP BY tweet.tweet_id;`
  const tweets = await db.all(getUserTweetsQuery)
  response.send(tweets)
})

app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const tweet = request.body
  const getUserIdQuery = `SELECT user_id FROM user WHERE
  username = '${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const date = new Date().toISOString()

  const postTweetQuery = `INSERT INTO tweet
  (tweet,user_id,date_time) VALUES 
  ('${tweet}','${getUserId.user_id}','${date}');`
  const responseResult = await db.run(postTweetQuery)
  const tweet_id = responseResult.lastID
  response.send('Created a Tweet')
})

app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  twitterAccess,
  async (request, response) => {
    const {tweetId} = request.params
    const {userId} = request
    const userQuery = `SELECT * FROM user 
  WHERE user_id = '${userId}';`
    const tweet = await db.get(userQuery)
    if (tweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deleteQuery = `DELETE FROM tweet WHERE tweet_id = '${tweetId}';`
      response.send('Tweet Removed')
    }
  },
)

module.exports = app
