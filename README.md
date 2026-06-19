# Simple Calculator with MongoDB History

This project is a small Node.js + Express calculator that stores recent calculations in MongoDB.

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the example environment file and update the MongoDB URL if needed:
   ```bash
   copy .env.example .env
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open http://localhost:3000 in your browser.

## Features
- Basic calculator UI
- Supports `+`, `-`, `*`, `/`, parentheses, and decimals
- Saves each valid calculation and its result in MongoDB
- Login/register flow with local and Google authentication
- Protected dashboard for user-specific history

## Deploy on Render

### 1) Prepare your environment values
Create a production `.env` file locally with values like:

```env
PORT=3000
MONGODB_URI=mongodb://your-mongodb-host:27017/calculator
SESSION_SECRET=your-random-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://your-app-name.onrender.com/auth/google/callback
```

### 2) Push your code to GitHub
Render deploys from a GitHub repository, so make sure the latest code is committed and pushed.

### 3) Create a new Web Service on Render
1. Go to Render and click **New +** → **Web Service**.
2. Connect your GitHub repository.
3. Use these settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: `Node`

### 4) Add environment variables on Render
In the Render dashboard, add these variables under **Environment**:
- `MONGODB_URI`
- `SESSION_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`

### 5) Use a MongoDB provider
Render does not host MongoDB for you, so you should use a hosted database such as:
- MongoDB Atlas
- Railway MongoDB
- Any other cloud MongoDB provider

### 6) Set Google OAuth callback correctly
If you use Google login, the callback URL in Google Cloud Console must match:

```text
https://your-app-name.onrender.com/auth/google/callback
```

### 7) Deploy
Click **Create Web Service** and Render will build and deploy your app automatically.

> Note: For Render, the app should bind to the port provided by the platform (`process.env.PORT`), which your code already does.

