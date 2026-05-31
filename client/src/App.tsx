import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Create from './pages/Create';
import Job from './pages/Job';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/create" element={<Create />} />
      <Route path="/jobs/:id" element={<Job />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
