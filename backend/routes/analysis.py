"""
Analysis API Routes
"""
from flask import Blueprint, request, jsonify
import sys
import os

# Add parent directory to path to import ai module
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ai import analyze_child

bp = Blueprint('analysis', __name__, url_prefix='/api/analysis')

@bp.route('/analyze', methods=['POST'])
def analyze():
    """Analyze a child's malnutrition risk"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['age', 'sex', 'weight', 'height']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'error': f'Missing required field: {field}'
                }), 400
        
        # Analyze child
        result = analyze_child(
            age=int(data['age']),
            sex=data['sex'],
            weight=float(data['weight']),
            height=float(data['height'])
        )
        
        return jsonify({
            'status': 'success',
            'data': result
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
