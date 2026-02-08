import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <div className="App">
      <Router>
        <Routes>
          <Route path="/" element={<div>Home Page - Add your Figma components here</div>} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;
