if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

const express = require("express");
const app = express();

const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");

const session = require("express-session");
const { MongoStore } = require("connect-mongo"); // ✅ Keep only this one
const flash = require("connect-flash");

const passport = require("passport");
const LocalStrategy = require("passport-local");

const User = require("./models/user.js");

const ExpressError = require("./utils/ExpressError.js");

const listingsRouter = require("./routes/listing.js");
const reviewsRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");

const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const dbUrl =
    process.env.ATLASDB_URL ||
    "mongodb://127.0.0.1:27017/wanderlust";

app.engine("ejs", ejsMate);

app.set("view engine", "ejs");

app.set(
    "views",
    path.join(__dirname, "views")
);

app.use(
    express.urlencoded({
        extended: true,
    })
);



app.use(express.json());

app.use(methodOverride("_method"));

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

const store = MongoStore.create({
    mongoUrl: process.env.ATLASDB_URL,
    crypto: {
        secret: process.env.EXPRESS_SESSION_SECRET,
    },
    touchAfter: 24 * 3600,
});

store.on("error", () => {
    console.log("Mongo Session Store Error", error);
});

const sessionOptions = {
    store,
    secret: process.env.EXPRESS_SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
    },
};

app.use(session(sessionOptions));

app.use(flash());

app.use(passport.initialize());

app.use(passport.session());

passport.use(
    new LocalStrategy(
        User.authenticate()
    )
);

passport.serializeUser(
    User.serializeUser()
);

passport.deserializeUser(
    User.deserializeUser()
);

app.use((req, res, next) => {
    res.locals.success =
        req.flash("success");

    res.locals.error =
        req.flash("error");

    res.locals.currUser =
        req.user;

    res.locals.mapToken =
        process.env.MAP_TOKEN;

    next();
});

app.get("/", (req, res) => {
    res.redirect("/listings");
});

app.use(
    "/listings",
    listingsRouter
);

app.use(
    "/listings/:id/reviews",
    reviewsRouter
);

app.use(
    "/",
    userRouter
);

app.get(
    "/.well-known/appspecific/com.chrome.devtools.json",
    (req, res) => {
        return res.status(204).end();
    }
);

app.all("*", (req, res, next) => {
    console.log(
        "404 REQUEST:",
        req.method,
        req.originalUrl
    );

    next(
        new ExpressError(
            404,
            "Page Not Found!"
        )
    );
});

app.use((err, req, res, next) => {
    console.log(
        "ERROR on:",
        req.method,
        req.originalUrl
    );

    console.log("FULL ERROR:");

    console.dir(err, {
        depth: null,
    });

    const {
        statusCode = 500,
        message = "Something went wrong!",
    } = err;

    res
        .status(statusCode)
        .render("error", {
            err: {
                message,
            },
        });
});

const PORT = process.env.PORT || 8080;

async function startServer() {
    try {
        await mongoose.connect(dbUrl);

        console.log("Connected to MongoDB");

        console.log(
            "Using Atlas:",
            !!process.env.ATLASDB_URL
        );

        app.listen(PORT, () => {
            console.log(
                `Server is running on port ${PORT}`
            );
        });
    } catch (err) {
        console.log(
            "MongoDB Connection Failed"
        );

        console.log(err);

        process.exit(1);
    }
}

startServer();