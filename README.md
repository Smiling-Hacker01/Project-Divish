# 💖 The Secret Space (Divish)

<p align="center">
  <strong>A private, secure, cross-platform relationship platform built for couples.</strong>
</p>

<p align="center">
A modern full-stack application featuring end-to-end encrypted messaging, biometric authentication, secure media sharing, offline-first synchronization, real-time communication, and intelligent relationship features.
</p>

---

## ✨ Overview

The Secret Space is designed as a complete ecosystem consisting of:

- 📱 Native React Native mobile application
- 🌐 Web client
- ⚙️ Backend API
- 🔄 Real-time communication infrastructure
- ☁️ Cloud media storage
- 🔐 Secure authentication & encryption

The platform focuses on privacy, security, reliability, and real-time collaboration while maintaining a seamless user experience across devices.

---

# 🏗 System Architecture

```
                        ┌────────────────────┐
                        │ React Native App  │
                        │   (Expo SDK 52)   │
                        └─────────┬──────────┘
                                  │
                                  │ REST + Socket.IO
                                  │
                        ┌─────────▼──────────┐
                        │    Node.js API     │
                        │    Express.js      │
                        └──────┬───────┬─────┘
                               │       │
                     Redis Pub/Sub   PostgreSQL
                               │       │
                               └──┬────┘
                                  │
                   Cloudinary • Firebase • Face API
```

---

# 📂 Repository Structure

```
.
├── secret-space-mobile/        # React Native + Expo application
├── secret-space-backend/       # Node.js + Express backend
├── secret-space-frontend/      # Web client
├── docs/
└── README.md
```

---

# 🚀 Technology Stack

## Mobile

- React Native
- Expo SDK 52
- TypeScript
- React Navigation
- Socket.IO
- Expo Secure Store
- Expo Local Authentication
- Expo Camera
- Firebase Cloud Messaging

---

## Backend

- Node.js
- Express.js
- PostgreSQL
- Prisma ORM
- Redis
- Socket.IO
- JWT Authentication
- Cloudinary
- node-cron

---

## Security

- JWT Authentication
- Refresh Tokens
- RSA-OAEP Encryption
- AES-GCM Encryption
- Face Authentication
- Biometric Vault
- Secure Key Storage
- End-to-End Encryption

---

# 🌟 Core Features

## 💬 Real-Time Chat

- Socket.IO powered messaging
- Message reactions
- Presence indicators
- Typing status
- Voice messages
- Media sharing

---

## 🔐 Secure Vault

- Biometric unlock
- Face verification
- Encrypted media
- Cloud synchronization

---

## 📖 Shared Diary

- Shared memories
- Image uploads
- Reactions
- Timeline view

---

## 🎟 Coupons & Favors

- Create
- Redeem
- Approve
- Fulfill
- Reviews

---

## 🤖 LoveBot

- Scheduled messages
- Automated reminders
- Personalized notifications

---

## 😊 Mood Tracking

- Live mood updates
- Smart notifications
- Relationship dashboard

---

# ⚡ Engineering Highlights

- Offline-first architecture
- End-to-end encrypted messaging
- Background synchronization
- Idempotent request queues
- Real-time event broadcasting
- Push notification infrastructure
- Biometric authentication
- RSA key management
- Secure media storage
- Scalable REST API
- Socket.IO event system

---

# 📱 Mobile Application

The native mobile application is built using:

- React Native
- Expo SDK 52
- New Architecture (Fabric)
- TypeScript

Highlights:

- Offline queues
- Secure local storage
- Push notifications
- Real-time synchronization
- Biometric authentication
- Camera integration

See:

```
secret-space-mobile/
```

---

# ⚙️ Backend

Backend services provide:

- Authentication
- Real-time communication
- Chat APIs
- Diary APIs
- Coupon APIs
- Vault APIs
- Push notifications
- Background jobs

Built with:

- Node.js
- Express
- PostgreSQL
- Redis
- Prisma

See:

```
secret-space-backend/
```

---

# 🌐 Web Client

The web application provides desktop access to the platform while sharing the same backend infrastructure as the mobile application.

See:

```
secret-space-frontend/
```

---

# 🔐 Security

Security was a primary design goal.

Implemented protections include:

- JWT Access + Refresh Tokens
- RSA Key Pair Generation
- AES-GCM Encryption
- Secure Key Storage
- Biometric Authentication
- Face Verification
- Secure Media Uploads
- Protected API Endpoints

---

# 🚀 Deployment

The platform supports:

- Android (Google Play)
- iOS (Apple App Store)
- Web
- Backend API

Deployment uses:

- Expo EAS Build
- Render
- PostgreSQL
- Redis
- Cloudinary
- Firebase

---

# 📄 License

This repository is proprietary software.

Unauthorized copying, modification, redistribution, or commercial use is prohibited.

© 2026 The Secret Space (Divish). All Rights Reserved.
