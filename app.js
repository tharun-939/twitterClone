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
  select * from follower natural join tweet where following_user_id = ${userId}
  order by date_time limit 4;`
  const tweets = await db.all(query)
})

module.exports = app
