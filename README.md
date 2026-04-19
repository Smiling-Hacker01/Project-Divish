# The Secret Space (Divish) 💖

A private, secure, and deeply personal space for couples to connect, communicate, and share memories. Built as a hybrid mobile application, The Secret Space provides real-time syncing, biometric security, and dedicated features designed to strengthen relationships.

![Banner](https://via.placeholder.com/1200x400?text=The+Secret+Space)

## 🌟 Key Features

### 1. **Biometric Vault** 🔒
A highly secure, private sharing space for sensitive memories and images. 
- **Face ID / Biometric Security:** Enforces facial geometry verification to access contents.
- **Password Fallback:** Secure fallback mechanism if biometrics fail.
- **Syncs Instantly:** Content added by one partner is instantly synced over the encrypted channel.
- **Media Support:** Upload and store high-quality images via Cloudinary.

### 2. **Coupons & Favors** 🎟️
A fun, interactive way to promise and fulfill real-world favors.
- **Full Lifecycle:** Create → Redeem → Approve → Fulfill.
- **Push Notifications:** Both partners receive real-time push notifications at every stage of the lifecycle.
- **Reviews:** Leave a star rating and sweet note after a coupon is fulfilled.

### 3. **Live Mood & Dashboard Sync** 😊
Always know how they are feeling without asking.
- **Real-time Status:** Dashboard polls securely in the background to show your partner's exact mood.
- **Instant Alerts:** Changing your mood sends a contextual push notification tailored to that specific emotion (e.g., "Your partner is feeling loved!").
- **Anniversary Counter:** A dynamic counter tracking your days together.

### 4. **LoveBot Automation** 🤖
Never accidentally forget to send a morning text again.
- **Scheduled Delivery:** Set a time, and the backend automated chron jobs will deploy a custom love note directly to your partner's device via push.
- **Dynamic Messages:** Pulls from a stored queue of sweet notes so it's always personal.

### 5. **Shared Diary** 📖
A chronological timeline of your best memories.
- Post text, photos, or milestones.
- Leave reactions (❤️, 👍) on specific entries.

---

## 🛠️ Architecture & Tech Stack

This project is split into two primary codebases: a Node.js Backend and a React Native/Capacitor Frontend.

### **Frontend** (`/secret-space-frontend`)
- **Framework:** React + Vite
- **Mobile Container:** Capacitor (allows building to fully native Android APKs)
- **Styling:** TailwindCSS
- **State/Routing:** React Router, Context API
- **Key Plugins:** Capacitor Camera, Capacitor Push Notifications, Capacitor FileSystem

### **Backend** (`/secret-space-backend`)
- **Server:** Node.js + Express.js
- **Database:** PostgreSQL hosted on Railway
- **ORM:** Prisma
- **Cache / PubSub:** Redis (Railway)
- **Authentication:** JWT (Access + Refresh tokens), bcrypt
- **Media Storage:** Cloudinary
- **Push Notifications:** Firebase Cloud Messaging (FCM) Admin SDK
- **Cron Jobs:** node-cron (for LoveBot deliveries)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL
- Redis server
- Cloudinary Account
- Firebase Project (for Push Notifications)
- Android Studio (for compiling the Capacitor APK)

### 1. Backend Setup

```bash
cd secret-space-backend
npm install
```

Create a `.env` file in the backend directory based on the following template:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://user:pass@localhost:5432/secret_space"
REDIS_URL="redis://localhost:6379"

JWT_SECRET="your_jwt_secret"
JWT_REFRESH_SECRET="your_refresh_secret"

CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_KEY="your_api_key"
CLOUDINARY_API_SECRET="your_api_secret"

FIREBASE_PROJECT_ID="your_project_id"
FIREBASE_CLIENT_EMAIL="your_client_email"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

Run migrations and start the server:
```bash
npx prisma migrate dev
npm run dev
```

### 2. Frontend Setup

```bash
cd secret-space-frontend
npm install
```

Create a `.env` file mapping the backend URL:
```env
VITE_API_BASE_URL=http://localhost:3000/api
# Or your production render URL: https://your-app.onrender.com/api
```

Start the web preview:
```bash
npm run dev
```

### 3. Native Android Build

To compile the native app with Capacitor:
```bash
npm run build
npx cap sync android
npx cap open android
```
From Android Studio, you can run the app on a physical device or emulator. *Note: Push Notifications require testing on a physical Android device with Google Play Services enabled.*

---

## 🔐 Security Details

- Password hashes use a strong salt round configuration (`bcrypt`).
- Access tokens expire frequently (7 days), while Refresh tokens handle session persistence securely.
- Vault Media is tracked via secure Database pointers and stored in hidden Cloudinary folders.
- Biometric verification uses device-bound security modules where available.

## 📄 License & Legal

**© 2026 The Secret Space (Divish). All Rights Reserved.**

This application and its source code are **strictly proprietary and confidential**. 
- No part of this repository may be reproduced, distributed, or transmitted in any form or by any means.
- Forking, copying, or reverse-engineering this codebase is **strictly prohibited**.
- Deploying clones or derivations of this application to the Google Play Store, Apple App Store, or any public distribution platform is forbidden.

Any unauthorized use, reproduction, or distribution of this software will result in immediate legal action.
