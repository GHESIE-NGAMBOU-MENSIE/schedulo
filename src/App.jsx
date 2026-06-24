import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

import Home from '@/pages/Home';
import Onboarding from '@/pages/Onboarding';
import StudyDates from '@/pages/StudyDates';
import StudyPreferences from '@/pages/StudyPreferences';
import CourseOverview from '@/pages/CourseOverview';
import CourseDetail from '@/pages/CourseDetail';
import TaskExtraction from '@/pages/TaskExtraction';
import Feasibility from '@/pages/Feasibility';
import PlanGeneration from '@/pages/PlanGeneration';
import ActivePlan from '@/pages/ActivePlan';
import Replanning from '@/pages/Replanning';
import Export from '@/pages/Export';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/" element={<Home />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/plan/:planId/dates" element={<StudyDates />} />
        <Route path="/plan/:planId/preferences" element={<StudyPreferences />} />
        <Route path="/plan/:planId/courses" element={<CourseOverview />} />
        <Route path="/plan/:planId/course/:courseId" element={<CourseDetail />} />
        <Route path="/plan/:planId/tasks" element={<TaskExtraction />} />
        <Route path="/plan/:planId/feasibility" element={<Feasibility />} />
        <Route path="/plan/:planId/generate" element={<PlanGeneration />} />
        <Route path="/plan/:planId/active" element={<ActivePlan />} />
        <Route path="/plan/:planId/replan" element={<Replanning />} />
        <Route path="/plan/:planId/export" element={<Export />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App