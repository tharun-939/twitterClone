const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()

const dbpath = path.join(__dirname, 'twitterClone.db')
let db = null
const intializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}
intializeDBAndServer()

app.use(express.json())

app.post('/register/', async (request, response) => {
  const {username, name, password, gender} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const selectUserQuery = `
  SELECT * FROM user 
  WHERE username = '${username}';`
  const dbuser = await db.get(selectUserQuery)
  if (dbuser === undefined) {
    if (password.length > 5) {
      const createUserQuery = `
        insert into user(username, name, password, gender) 
        values('${username}', '${name}', '${hashedPassword}', '${gender}');`
      await db.run(createUserQuery)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
  select * from user where username = '${username}';`
  const userDb = await db.get(selectUserQuery)
  if (userDb === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, userDb.password)
    if (isPasswordMatched) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken: jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const authentication = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.get('/user/tweets/feed/', authentication, async (request, response) => {
  const username = request.username
  const userQuery = `
  select user_id from user where username = '${username}';`
  const userDb = await db.get(userQuery)
  const userId = userDb.user_id
  console.log(userId)
  const query = `
  select distinct tweet, date_time from follower natural join tweet where following_user_id = ${userId}
  order by  date_time DESC limit 4;`
  const tweets = await db.all(query)
  console.log(tweets)
  response.send(
    tweets.map(eachTweet => {
      return {
        username: username,
        tweet: eachTweet.tweet,
        dateTime: eachTweet.date_time,
      }
    }),
  )
})

app.get('/user/following/', authentication, async (request, response) => {
  const username = request.username
  const userIdQuery = `select user_id from user where username = '${username}';`
  const userDb = await db.get(userIdQuery)
  const userId = userDb.user_id
  const selectQuery = `select distinct name from follower natural join user where follower_user_id = '${userId}';`
  const followingDb = await db.all(selectQuery)
  response.send(
    followingDb.map(each => {
      return {
        name: each.name,
      }
    }),
  )
})

app.get('/user/followers/', authentication, async (request, response) => {
  const username = request.username
  const userIdQuery = `select user_id from user where username = '${username}';`
  const userDb = await db.get(userIdQuery)
  const userId = userDb.user_id
  const selectQuery = `select distinct name from follower natural join user where following_user_id = '${userId}';`
  const followingDb = await db.all(selectQuery)
  response.send(
    followingDb.map(each => {
      return {
        name: each.name,
      }
    }),
  )
})

app.get('/tweets/:tweetId/', authentication, async (request, response) => {
  const username = request.username
  const getUser1IdQuery = `select * from user where username = '${username}';`
  const user1ID = await db.get(getUser1IdQuery)
  const {tweetId} = request.params
  const selectQuery = `select * from tweet where tweet_id = '${tweetId}';`
  const tweetDb = await db.get(selectQuery)
  const tweetUserId = tweetDb.user_id
  const verifyQuery = `select * from follower where follower_user_id = '${user1ID}' and following_user_id = '${tweetUserId}';`
  const verifyDb = await db.get(verifyQuery)
  if (verifyDb === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const likesQuery = `select count(like_id) as likes from like where tweet_id = '${tweetUserId}';`
    const replyQuery = `select count(repiles) as replies from reply where user_id tweet_id = '${tweet_id}';`
    response.send({
      tweet: tweetDb.tweet,
      likes: likesQuery.likes,
      replies: replyQuery.replies,
      dateTime: tweetDb.date_time,
    })
  }
})

app.get('/user/tweets/', authentication, async (request, response) => {
  const username = request.username
  const userIdQuery = `select * from user where username = '${username}';`
  const userDB = await db.get(userIdQuery)
  const allTweetsQuery = `
   select tweet, count(like_id) as likes, count(reply) as replies, date_time from tweet natural join like natural join reply
   where user_id = '${userDB.user_id}'
   group by tweet;`;
  const allTweetsDb = await db.all(allTweetsQuery)
  response.send(allTweetsDb)
})

app.post('/user/tweets/', authentication, async (request, response) => {
  const username = request.username
  const {tweet} = request.body
  const userIdQuery = `select * from user where username = '${username}';`
  const userDb = await db.get(userIdQuery)
  const userId = userDb.user_id
  const date = new Date()
  const AddTweetQuery = `INSERT INTO tweet (tweet, user_id, date_time)
  VALUES('${tweet}', '${userId}', '${date}');`
  await db.run(AddTweetQuery)
  response.send('Created a Tweet')
})

app.delete('/tweets/:tweetId/', authentication, async (request, response) => {
  const username = request.username
  const getUserIdQuery = `select * from user where username = '${username}';`
  const userDb = await db.get(getUserIdQuery)
  const userId = userDb.user_id
  const {tweetId} = request.params
  const verifyQuery = `select * from tweet where tweet_id = '${tweetId}';`
  const verifyDb = await db.get(verifyQuery)
  if (verifyDb.user_id === userId) {
    const deleteQuery = `delete from tweet where tweet_id = '${tweetId}';`
    await db.run(deleteQuery)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

module.exports = app
