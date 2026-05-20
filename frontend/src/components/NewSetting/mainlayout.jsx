import React from 'react';
import './App.css'; 
import Navbar from './Component/Navbar/navbar';
import Sidebar from './Component/Sidebar/Sidebar';
import { Profile } from './Component/Profile/profile';

function App() {
  return (
    <div className="app-canvas-wrapper">
      
      {/* 1. Full-Width Top Navigation Anchor */}
      <Navbar />

      {/* 2. Content Split Window Grid */}
      <div className="dashboard-core-container">
        
        {/* Left Wing Sidebar Navigation */}
        <Sidebar />
        
        {/* Right Wing Scrolling Viewport */}
        <main className="dashboard-main-content-view">
          <div className="content-max-width-restrictor">
            <Profile />
          </div>
        </main>

      </div>
    </div>
  );
}

export default App;