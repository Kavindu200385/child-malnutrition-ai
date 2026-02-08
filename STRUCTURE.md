# Project File Structure

## Complete Directory Structure

```
child-malnutrition-ai/
│
├── backend/                          # Flask Backend
│   ├── ai/                           # AI Module (all AI files here)
│   │   ├── __init__.py
│   │   ├── child_risk_analyzing.py   # Main analysis engine
│   │   ├── data_processing.py        # Data processing
│   │   └── model_training.py         # Model training
│   │
│   ├── routes/                       # API Routes
│   │   ├── __init__.py
│   │   ├── analysis.py               # Analysis endpoints
│   │   ├── children.py               # Children records endpoints
│   │   └── history.py                # History endpoints
│   │
│   ├── models/                       # ML Models
│   │   ├── model_birth_to_2.joblib
│   │   ├── model_age_2_to_5.joblib
│   │   ├── label_encoder_birth_to_2.joblib
│   │   └── label_encoder_age_2_to_5.joblib
│   │
│   ├── data/                         # Data storage
│   │   └── children_records.csv
│   │
│   ├── dataset/                      # Training datasets
│   │   ├── birth_to_2_cleaned.csv
│   │   └── age_2_to_5_cleaned.csv
│   │
│   ├── app.py                        # Flask application entry point
│   └── requirements.txt              # Python dependencies
│
└── frontend/                         # React Frontend
    ├── public/                       # Static files
    ├── src/
    │   ├── components/              # React components (add Figma components here)
    │   ├── pages/                   # Page components
    │   ├── services/                # API services
    │   │   └── api.js               # API client
    │   ├── utils/                   # Utilities
    │   ├── assets/                  # Images, fonts, etc.
    │   ├── App.js                   # Main App component
    │   ├── main.jsx                 # Entry point
    │   └── index.css                # Global styles
    │
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── .gitignore
```

## Key Points

1. **All AI files are in `backend/ai/`** - organized and easy to find
2. **Models, Data, Dataset are in `backend/`** - all backend resources together
3. **Routes are separated** - clean API structure
4. **Frontend is ready** - just add your Figma components
5. **All paths are fixed** - imports and file paths updated for new structure

## Next Steps

1. Add your Figma components to `frontend/src/components/`
2. Create pages in `frontend/src/pages/`
3. Update `frontend/src/App.js` with your routes
4. Test the API endpoints
