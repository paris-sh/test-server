require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/calculator';
const googleAuthEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Calculator API',
      version: '1.0.0',
      description: 'API documentation for the calculator application.',
    },
  },
  apis: ['./server.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'calculator-secret',
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.googleAuthEnabled = googleAuthEnabled;
  next();
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    displayName: { type: String },
  },
  { timestamps: true }
);

const calculationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expression: { type: String, required: true },
    result: { type: Number, required: true },
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
const Calculation = mongoose.model('Calculation', calculationSchema);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const normalizedUsername = username.trim().toLowerCase();
      const user = await User.findOne({ username: normalizedUsername });

      if (!user || !user.password) {
        return done(null, false, { message: 'Invalid username or password.' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: 'Invalid username or password.' });
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  })
);

if (googleAuthEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          let user = await User.findOne({ googleId: profile.id });

          if (!user && email) {
            user = await User.findOne({ username: email.toLowerCase() });
          }

          if (!user) {
            const username = email || `google-${profile.id}`;
            user = await User.create({
              username,
              googleId: profile.id,
              displayName: profile.displayName,
            });
          } else if (!user.googleId) {
            user.googleId = profile.id;
            user.displayName = user.displayName || profile.displayName;
            await user.save();
          }

          done(null, user);
        } catch (error) {
          done(error);
        }
      }
    )
  );
}

function isValidExpression(value) {
  return /^[0-9+\-*/().\s]+$/.test(value);
}

function calculateExpression(expression) {
  const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
  const result = new Function(`return (${sanitized});`)();

  if (!Number.isFinite(result)) {
    throw new Error('Invalid result');
  }

  return result;
}

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  return res.redirect('/login');
}

function ensureAuthenticatedApi(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

app.get('/login', (req, res) => {
  res.render('login', {
    error: req.query.error ? 'Invalid username or password.' : null,
  });
});

app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
  const username = (req.body.username || '').trim().toLowerCase();
  const password = req.body.password || '';
  const confirmPassword = req.body.confirmPassword || '';

  if (!username || !password || !confirmPassword) {
    return res.render('register', { error: 'Please fill in all fields.' });
  }

  if (password.length < 6) {
    return res.render('register', { error: 'Password must be at least 6 characters.' });
  }

  if (password !== confirmPassword) {
    return res.render('register', { error: 'Passwords do not match.' });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.render('register', { error: 'Username already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({
      username,
      password: hashedPassword,
      displayName: username,
    });

    return res.redirect('/login');
  } catch (error) {
    console.error(error);
    return res.render('register', { error: 'Unable to register user.' });
  }
});

app.post(
  '/login',
  passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login?error=1',
  })
);

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *               - confirmPassword
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               confirmPassword:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully.
 *       400:
 *         description: Validation error.
 *       409:
 *         description: Username already exists.
 */
app.post('/api/auth/register', async (req, res) => {
  const username = (req.body.username || '').trim().toLowerCase();
  const password = req.body.password || '';
  const confirmPassword = req.body.confirmPassword || '';

  if (!username || !password || !confirmPassword) {
    return res.status(400).json({ error: 'Please fill in all fields.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({
      username,
      password: hashedPassword,
      displayName: username,
    });

    return res.status(201).json({ message: 'User registered successfully.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to register user.' });
  }
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Log in a user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successfully logged in.
 *       401:
 *         description: Invalid credentials.
 */
app.post('/api/auth/login', (req, res, next) => {
  passport.authenticate('local', (error, user, info) => {
    if (error) {
      return next(error);
    }

    if (!user) {
      return res.status(401).json({ error: info && info.message ? info.message : 'Invalid credentials.' });
    }

    req.logIn(user, (loginError) => {
      if (loginError) {
        return next(loginError);
      }

      return res.json({
        message: 'Logged in successfully.',
        user: {
          id: user._id,
          username: user.username,
          displayName: user.displayName || user.username,
        },
      });
    });
  })(req, res, next);
});

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Log out the current user
 *     responses:
 *       200:
 *         description: Logged out successfully.
 *       401:
 *         description: Not authenticated.
 */
app.post('/api/auth/logout', ensureAuthenticatedApi, (req, res, next) => {
  req.logout((error) => {
    if (error) {
      return next(error);
    }

    return res.json({ message: 'Logged out successfully.' });
  });
});

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Get the current authenticated user
 *     responses:
 *       200:
 *         description: Current user details.
 *       401:
 *         description: Not authenticated.
 */
app.get('/api/auth/me', ensureAuthenticatedApi, (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      username: req.user.username,
      displayName: req.user.displayName || req.user.username,
      googleId: Boolean(req.user.googleId),
    },
  });
});

app.get('/logout', (req, res, next) => {
  req.logout((error) => {
    if (error) {
      return next(error);
    }
    return res.redirect('/login');
  });
});

if (googleAuthEnabled) {
  app.get(
    '/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  app.get(
    '/auth/google/callback',
    passport.authenticate('google', {
      failureRedirect: '/login?error=google',
    }),
    (req, res) => {
      res.redirect('/');
    }
  );
} else {
  app.get('/auth/google', (req, res) => {
    res.status(503).send('Google login is not configured.');
  });

  app.get('/auth/google/callback', (req, res) => {
    res.status(503).send('Google login is not configured.');
  });
}

/**
 * @openapi
 * /:
 *   get:
 *     summary: Render the calculator dashboard
 *     description: Fetches the latest calculation history and renders the home page.
 *     responses:
 *       200:
 *         description: HTML page with recent calculations.
 *       500:
 *         description: Failed to load calculation history.
 */
app.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const history = await Calculation.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10);
    res.render('index', { history });
  } catch (error) {
    console.error(error);
    res.status(500).send('Unable to load history.');
  }
});

app.get('/dashboard', ensureAuthenticated, async (req, res) => {
  try {
    const [history, total, latest] = await Promise.all([
      Calculation.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(10),
      Calculation.countDocuments({ user: req.user._id }),
      Calculation.findOne({ user: req.user._id }).sort({ createdAt: -1 }),
    ]);

    res.render('dashboard', {
      history,
      stats: {
        total,
        latest,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Unable to load dashboard.');
  }
});

/**
 * @openapi
 * /api/dashboard:
 *   get:
 *     summary: Get dashboard data for the current user
 *     responses:
 *       200:
 *         description: Dashboard stats and recent calculations.
 *       401:
 *         description: Not authenticated.
 */
app.get('/api/dashboard', ensureAuthenticatedApi, async (req, res) => {
  try {
    const [history, total, latest] = await Promise.all([
      Calculation.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(10),
      Calculation.countDocuments({ user: req.user._id }),
      Calculation.findOne({ user: req.user._id }).sort({ createdAt: -1 }),
    ]);

    return res.json({
      stats: {
        total,
        latest: latest ? { expression: latest.expression, result: latest.result } : null,
      },
      history,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to load dashboard.' });
  }
});

/**
 * @openapi
 * /calculate:
 *   post:
 *     summary: Calculate an expression
 *     description: Validates and evaluates a mathematical expression, then saves it to the database.
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - expression
 *             properties:
 *               expression:
 *                 type: string
 *                 example: 2+3*4
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - expression
 *             properties:
 *               expression:
 *                 type: string
 *                 example: 2+3*4
 *     responses:
 *       200:
 *         description: Returns the calculated result as JSON.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 expression:
 *                   type: string
 *                 result:
 *                   type: number
 *                 date:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Missing or invalid expression.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
app.post('/calculate', ensureAuthenticated, async (req, res) => {
  const expression = (req.body.expression || '').trim();

  if (!expression) {
    return res.status(400).json({ error: 'Please enter an expression.' });
  }

  if (!isValidExpression(expression)) {
    return res.status(400).json({ error: 'Only numbers and basic operators are allowed.' });
  }

  try {
    const result = calculateExpression(expression);
    const date = new Date().toISOString();
    await Calculation.create({ user: req.user._id, expression, result });
    return res.json({ expression, result, date });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ error: 'Invalid calculation.' });
  }
});

async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
}

start();
