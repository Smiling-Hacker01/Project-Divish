import { createBrowserRouter } from "react-router";
import { ProtectedRoute } from "./components/ProtectedRoute";

import Splash from "./screens/Splash";
import SignUp from "./screens/SignUp";
import OTPVerification from "./screens/OTPVerification";
import FaceEnrollment from "./screens/FaceEnrollment";
import CoupleCode from "./screens/CoupleCode";
import JoinWithCode from "./screens/JoinWithCode";
import LoginNew from "./screens/LoginNew";
import ForgotPassword from "./screens/ForgotPassword";
import Home from "./screens/Home";
import Diary from "./screens/Diary";
import DiaryCreate from "./screens/DiaryCreate";
import DiaryDetail from "./screens/DiaryDetail";
import MoodCheckIn from "./screens/MoodCheckIn";
import Coupons from "./screens/Coupons";
import CouponCreate from "./screens/CouponCreate";
import CouponDetail from "./screens/CouponDetail";
import LoveBot from "./screens/LoveBot";
import LoveBotAddReason from "./screens/LoveBotAddReason";
import Vault from "./screens/Vault";
import VaultUnlock from "./screens/VaultUnlock";
import Settings from "./screens/Settings";

export const router = createBrowserRouter([
  // Public Routes
  { path: "/", Component: Splash },
  { path: "/signup", Component: SignUp },
  { path: "/otp-verification", Component: OTPVerification },
  { path: "/face-enrollment", Component: FaceEnrollment },
  { path: "/couple-code", Component: CoupleCode },
  { path: "/join", Component: JoinWithCode },
  { path: "/login", Component: LoginNew },
  { path: "/forgot-password", Component: ForgotPassword },

  // Protected Routes
  { path: "/home", element: <ProtectedRoute><Home /></ProtectedRoute> },
  { path: "/diary", element: <ProtectedRoute><Diary /></ProtectedRoute> },
  { path: "/diary/create", element: <ProtectedRoute><DiaryCreate /></ProtectedRoute> },
  { path: "/diary/:id", element: <ProtectedRoute><DiaryDetail /></ProtectedRoute> },
  { path: "/mood", element: <ProtectedRoute><MoodCheckIn /></ProtectedRoute> },
  { path: "/coupons", element: <ProtectedRoute><Coupons /></ProtectedRoute> },
  { path: "/coupons/create", element: <ProtectedRoute><CouponCreate /></ProtectedRoute> },
  { path: "/coupons/:id", element: <ProtectedRoute><CouponDetail /></ProtectedRoute> },
  { path: "/lovebot", element: <ProtectedRoute><LoveBot /></ProtectedRoute> },
  { path: "/lovebot/add", element: <ProtectedRoute><LoveBotAddReason /></ProtectedRoute> },
  { path: "/vault/unlock", element: <ProtectedRoute><VaultUnlock /></ProtectedRoute> },
  { path: "/vault", element: <ProtectedRoute><Vault /></ProtectedRoute> },
  { path: "/settings", element: <ProtectedRoute><Settings /></ProtectedRoute> },
]);