# Child Malnutrition AI System

A full-stack web application for analyzing child malnutrition risk using AI/ML models.

## Project Structure

```
child-malnutrition-ai/
├── backend/                 # Flask Backend
│   ├── ai/                  # AI Module
│   │   ├── child_risk_analyzing.py
│   │   ├── data_processing.py
│   │   └── model_training.py
│   ├── routes/              # API Routes
│   │   ├── analysis.py
│   │   ├── children.py
│   │   └── history.py
│   ├── models/              # ML Models
│   ├── data/                # Data storage
│   ├── dataset/             # Training datasets
│   ├── app.py               # Flask application
│   └── requirements.txt
│
└── frontend/                # React Frontend
    ├── src/
    │   ├── components/      # React components
    │   ├── pages/           # Page components
    │   ├── services/        # API services
    │   └── utils/           # Utilities
    ├── package.json
    └── vite.config.js
```

## Setup Instructions

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment (recommended):
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run Flask server:
```bash
python app.py
```

The backend will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## API Endpoints

### Analysis
- `POST /api/analysis/analyze` - Analyze child malnutrition risk
  ```json
  {
    "age": 18,
    "sex": "M",
    "weight": 8.5,
    "height": 75
  }
  ```

### Children Records
- `POST /api/children/save` - Save child record
  ```json
  {
    "child_id": "CH001",
    "age": 18,
    "sex": "M",
    "weight": 8.5,
    "height": 75
  }
  ```

- `GET /api/children/history/<child_id>` - Get child history

### Health Check
- `GET /health` - Health check endpoint

## Features

- ✅ AI-powered malnutrition risk analysis
- ✅ WHO growth standards Z-score calculations
- ✅ Child history tracking
- ✅ RESTful API
- ✅ React frontend (ready for Figma integration)

## Next Steps

1. Add your Figma frontend components to `frontend/src/components/`
2. Create pages in `frontend/src/pages/`
3. Connect components to API services in `frontend/src/services/api.js`
