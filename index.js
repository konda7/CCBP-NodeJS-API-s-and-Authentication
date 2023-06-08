const express = require("express"); // Import express framework
const app = express(); //Creating an express instance. With this we can use express methods.

app.use(express.json()); //This is a middleware function. It allows the express to read the json data.

const path = require("path"); //Core module
const dbPath = path.join(__dirname, "goodreads.db"); //To locate the file and give a path to it.

const { open } = require("sqlite"); //Open method from sqlite is useful to establish connection b/w server and database.
const sqlite3 = require("sqlite3"); //Import sqlite3 to work as a driver.

const bcrypt = require("bcrypt"); //Useful to encrypt passwords.

const jwt = require("jsonwebtoken"); //Used to create a jwtToken.

let db = null; //Give initially null because if connection goes wrong, it will have null as value rather than undefined.

const initializeDBAndServer = async () => {
  //Error Handling
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    //If connection went well, we'll listen to the port 3000.
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1); //Used to exit the current process.
  }
};
initializeDBAndServer();

//Authentication Middleware
const authenticateToken = (request, response, next) => {
  //Get jwtToken from the header and check whether it's valid or not.
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1]; //Getting only jwtToken value by removing Bearer.
  }
  if (jwtToken === undefined) {
    response.status(401); //Unauthorized
    response.send("Invalid JWT Token");
  } else {
    //We have to give the same secret key when we are using it to create the jwtToken.
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401); //Unauthorized
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username; //Sending data to next middleware or handler through request object.
        next(); //To go the next middleware or handler we need to mention(call) it.
      }
    });
  }
};

//User Register API
app.post("/users/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);

  //Check whether the user already exist or not. If not, then create.
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender, location) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}',
          '${location}'
        )`;
    await db.run(createUserQuery);
    response.send(`User created successfully`);
  } else {
    response.status(400); //Bad Request
    response.send("User already exists");
  }
});

//User Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  //Check whether the user already exist or not. If present, login.
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400); //Bad Request
    response.send("Invalid User");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    //If passwords matched, create jwtToken
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400); //Bad Request
      response.send("Invalid Password");
    }
  }
});

//Get Profile
//Don't forget to add the authorization middleware for every API call.
app.get("/profile/", authenticateToken, async (request, response) => {
  let { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userDetails = await db.get(selectUserQuery);
  response.send(userDetails);
});

//Get Books API
app.get("/books/", authenticateToken, async (request, response) => {
  const getBooksQuery = `
   SELECT
    *
   FROM
    book
   ORDER BY
    book_id;`;
  const booksArray = await db.all(getBooksQuery);
  response.send(booksArray);
});

//Get Books(with Filters) API
app.get("/books/", authenticateToken, async (request, response) => {
  //Give default values every time.
  const {
    offset = 2,
    limit = 5,
    order = "ASC",
    order_by = "book_id",
    search_q = "",
  } = request.query;
  const getBooksQuery = `
    SELECT
      *
    FROM
     book
    WHERE
     title LIKE '%${search_q}%'
    ORDER BY ${order_by} ${order}
    LIMIT ${limit} OFFSET ${offset};`;
  const booksArray = await db.all(getBooksQuery);
  response.send(booksArray);
});

//Get Book API
app.get("/books/:bookId/", authenticateToken, async (request, response) => {
  const { bookId } = request.params;
  const getBookQuery = `
      SELECT
       *
      FROM
       book 
      WHERE
       book_id = ${bookId};
    `;
  const book = await db.get(getBookQuery);
  response.send(book);
});

//Add Book API
app.post("/books/", authenticateToken, async (request, response) => {
  const bookDetails = request.body;
  const {
    title,
    authorId,
    rating,
    ratingCount,
    reviewCount,
    description,
    pages,
    dateOfPublication,
    editionLanguage,
    price,
    onlineStores,
  } = bookDetails;
  const addBookQuery = `
    INSERT INTO
      book (title,author_id,rating,rating_count,review_count,description,pages,date_of_publication,edition_language,price,online_stores)
    VALUES
      (
        '${title}',
         ${authorId},
         ${rating},
         ${ratingCount},
         ${reviewCount},
        '${description}',
         ${pages},
        '${dateOfPublication}',
        '${editionLanguage}',
         ${price},
        '${onlineStores}'
      );`;

  const dbResponse = await db.run(addBookQuery);
  const bookId = dbResponse.lastID; //It gives the ID of the latest book created.
  response.send({ bookId: bookId });
});

//Update Book API
app.put("/books/:bookId/", authenticateToken, async (request, response) => {
  const { bookId } = request.params;
  const bookDetails = request.body;
  const {
    title,
    authorId,
    rating,
    ratingCount,
    reviewCount,
    description,
    pages,
    dateOfPublication,
    editionLanguage,
    price,
    onlineStores,
  } = bookDetails;
  const updateBookQuery = `
    UPDATE
      book
    SET
      title='${title}',
      author_id=${authorId},
      rating=${rating},
      rating_count=${ratingCount},
      review_count=${reviewCount},
      description='${description}',
      pages=${pages},
      date_of_publication='${dateOfPublication}',
      edition_language='${editionLanguage}',
      price=${price},
      online_stores='${onlineStores}'
    WHERE
      book_id = ${bookId};`;
  await db.run(updateBookQuery);
  response.send("Book Updated Successfully");
});

//Delete Book API
app.delete("/books/:bookId/", authenticateToken, async (request, response) => {
  const { bookId } = request.params;
  const deleteBookQuery = `
    DELETE FROM
      book
    WHERE
      book_id = ${bookId};`;
  await db.run(deleteBookQuery);
  response.send("Book Deleted Successfully");
});

//Get Author Books API
app.get(
  "/authors/:authorId/books/",
  authenticateToken,
  async (request, response) => {
    const { authorId } = request.params;
    const getAuthorBooksQuery = `
    SELECT
     *
    FROM
     book
    WHERE
      author_id = ${authorId};`;
    const booksArray = await db.all(getAuthorBooksQuery);
    response.send(booksArray);
  }
);
