const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

let db = null;

const dbPath = path.join(__dirname, "twitterClone.db");

const initialDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3001, () => {
      console.log("The server is started");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initialDbAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const registerDetailsQuery = `insert into user(username, password, name, gender) 
    values('${username}','${hashedPassword}','${name}','${gender}')`;
  const getUserQuery = `select * from user where username = '${username}'`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      await db.run(registerDetailsQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const userDetailsQuery = `select * from user where username = '${username}'`;
  const dbUser = await db.get(userDetailsQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordCorrect = await bcrypt.compare(password, dbUser.password);
    if (isPasswordCorrect === true) {
      payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "FORGOT");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "FORGOT", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select * from user where username = '${username}'`;
  const getUserId = await db.get(getUserIdQuery);
  const userId = getUserId.user_id;
  const getUserTweetsQuery = `select u2.username,tweet,date_time as dateTime from user u
    join follower f on u.user_id = f.follower_user_id 
    join tweet t on f.following_user_id = t.user_id join user u2 on u2.user_id = t.user_id
    where u.user_id = ${userId}
    order by dateTime Desc
    limit 4`;
  const getUserTweets = await db.all(getUserTweetsQuery);
  response.send(getUserTweets);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select * from user where username = '${username}'`;
  const getUserId = await db.get(getUserIdQuery);
  const userId = getUserId.user_id;
  const getUserFollowsQuery = `select distinct u2.name as name from user u
    join follower f on u.user_id = f.follower_user_id 
    join user u2 on f.following_user_id = u2.user_id
     where u.user_id = ${userId}`;
  const getUserFollows = await db.all(getUserFollowsQuery);
  response.send(getUserFollows);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select * from user where username = '${username}'`;
  const getUserId = await db.get(getUserIdQuery);
  const userId = getUserId.user_id;
  const getUserFollowsQuery = `select distinct u2.name as name from user u
    join follower f on u.user_id = f.following_user_id 
    join user u2 on f.follower_user_id = u2.user_id
    where u.user_id = ${userId}`;
  const getUserFollows = await db.all(getUserFollowsQuery);
  response.send(getUserFollows);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const getTweetsInfoQuery = `select tweet, count(distinct l.like_id) as likes,
  count(distinct r.reply_id) as replies,date_time as dateTime from
  tweet t join like l on t.tweet_id = l.tweet_id
  join reply r on t.tweet_id = r.tweet_id
  where t.tweet_id = ${tweetId} and t.user_id in (select distinct f.following_user_id from user u
    join follower f on u.user_id = f.follower_user_id 
    join user u2 on f.following_user_id = u2.user_id
    where u2.username  != '${username}')`;
  const getTweetsInfo = await db.get(getTweetsInfoQuery);
  if (getTweetsInfo.tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(getTweetsInfo);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getTweetsInfoQuery = `select u.username as name 
  from tweet t join like l on t.tweet_id = l.tweet_id
  join user u on l.user_id = u.user_id
  where t.tweet_id = ${tweetId} and t.user_id in (select distinct f.following_user_id from user u
    join follower f on u.user_id = f.follower_user_id 
    join user u2 on f.following_user_id = u2.user_id
    where u2.username  != '${username}')`;
    const getTweetsInfo = await db.all(getTweetsInfoQuery);
    if (getTweetsInfo.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let names = [];
      getTweetsInfo.forEach((item) => {
        names.push(item["name"]);
      });
      response.send({ likes: names });
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getTweetsInfoQuery = `select u.name as name,reply 
  from tweet t join reply r on t.tweet_id = r.tweet_id
  join user u on r.user_id = u.user_id
  where t.tweet_id = ${tweetId} and t.user_id in (select distinct f.following_user_id from user u
    join follower f on u.user_id = f.follower_user_id 
    join user u2 on f.following_user_id = u2.user_id
    where u2.username  != '${username}')`;
    const getTweetsInfo = await db.all(getTweetsInfoQuery);
    if (getTweetsInfo.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ replies: getTweetsInfo });
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select * from user where username = '${username}'`;
  const getUserId = await db.get(getUserIdQuery);
  const userId = getUserId.user_id;
  const getTweetsInfoQuery = `select tweet,count(distinct l.like_id) as likes,count(distinct r.reply_id)
   as replies,date_time as dateTime from user u left join tweet t on u.user_id = t.user_id left join like l
    on t.tweet_id = l.tweet_id left join reply r
   on t.tweet_id = r.tweet_id
   where u.user_id = ${userId}
   group by tweet,dateTime`;
  const getTweetsInfo = await db.all(getTweetsInfoQuery);
  if (getTweetsInfo[0].tweet === null) {
    response.send();
  } else {
    response.send(getTweetsInfo);
  }
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select * from user where username = '${username}'`;
  const getUserId = await db.get(getUserIdQuery);
  const userId = getUserId.user_id;
  const { tweet } = request.body;
  let today = new Date();
  let month = today.getMonth() + 1;
  if (month < 10) {
    month = "0" + month;
  }
  let day = today.getDate();
  if (day < 10) {
    day = "0" + day;
  }
  let hours = today.getHours() + 5;
  if (hours < 10) {
    hours = "0" + hours;
  }
  let mins = today.getMinutes();
  if (mins < 10) {
    mins = "0" + mins;
  }
  let secs = today.getSeconds();
  if (secs < 10) {
    secs = "0" + secs;
  }
  let date = today.getFullYear() + "-" + month + "-" + day;
  let time = hours + ":" + mins + ":" + secs;
  let dateTime = date + " " + time;
  //console.log(dateTime);
  const addTweetQuery = `insert into tweet(tweet,user_id,date_time)
  values('${tweet}',${userId},'${dateTime}')`;
  await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserIdQuery = `select * from user where username = '${username}'`;
    const getUserId = await db.get(getUserIdQuery);
    const userId = getUserId.user_id;
    const deleteTweetQuery = `Delete from tweet where user_id = ${userId} and tweet_id = ${tweetId}`;
    const tweetIdQuery = `select tweet_id from tweet where user_id = ${userId}`;
    const tweetIDs = await db.all(tweetIdQuery);
    //let ids = [];
    let check = false;
    tweetIDs.forEach((item) => {
      //ids.push(item.tweet_id);
      if (item.tweet_id == tweetId) {
        check = true;
      }
    });
    //console.log(check);
    if (!check) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
