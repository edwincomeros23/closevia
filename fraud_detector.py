#!/usr/bin/env python3
"""
Fraud Detection Service
Loads the trained fraud_model.joblib and performs fraud predictions
on product listings and trades
"""

import json
import sys
import os
import joblib
import pandas as pd
import numpy as np
from pathlib import Path

# Get the models directory path
MODELS_DIR = Path(__file__).parent / "models"
MODEL_PATH = MODELS_DIR / "fraud_model.joblib"

# Expected features for the model
FEATURES = [
    'account_age_days',
    'total_trades',
    'trades_last_7_days',
    'avg_item_value',
    'listed_item_value',
    'estimated_item_value',
    'price_mismatch_ratio',
    'category_match',
    'image_is_stock_photo',
    'description_length',
]


def calculate_price_mismatch_ratio(listed_price: float, estimated_price: float) -> float:
    """Calculate the price mismatch ratio"""
    if estimated_price == 0:
        return 0
    return abs(listed_price - estimated_price) / estimated_price


def load_model():
    """Load the fraud detection model"""
    if not MODEL_PATH.exists():
        print(json.dumps({
            "success": False,
            "error": f"Model file not found at {MODEL_PATH}"
        }))
        sys.exit(1)
    
    try:
        model = joblib.load(MODEL_PATH)
        return model
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Failed to load model: {str(e)}"
        }))
        sys.exit(1)


def predict_fraud(data: dict) -> dict:
    """
    Predict if a product/trade is fraudulent
    
    Expected input data:
    {
        "account_age_days": int,
        "total_trades": int,
        "trades_last_7_days": int,
        "avg_item_value": float,
        "listed_item_value": float,
        "estimated_item_value": float,
        "category_match": int (0 or 1),
        "image_is_stock_photo": int (0 or 1),
        "description_length": int
    }
    """
    try:
        # Calculate price mismatch ratio
        price_mismatch = calculate_price_mismatch_ratio(
            data.get("listed_item_value", 0),
            data.get("estimated_item_value", 1)
        )
        
        # Prepare feature vector
        features_data = {
            'account_age_days': data.get('account_age_days', 0),
            'total_trades': data.get('total_trades', 0),
            'trades_last_7_days': data.get('trades_last_7_days', 0),
            'avg_item_value': data.get('avg_item_value', 0),
            'listed_item_value': data.get('listed_item_value', 0),
            'estimated_item_value': data.get('estimated_item_value', 0),
            'price_mismatch_ratio': price_mismatch,
            'category_match': data.get('category_match', 0),
            'image_is_stock_photo': data.get('image_is_stock_photo', 0),
            'description_length': data.get('description_length', 0),
        }
        
        # Create dataframe with features
        df = pd.DataFrame([features_data])[FEATURES]
        
        # Load model
        model = load_model()
        
        # Get prediction and probability
        prediction = model.predict(df)[0]  # 0 = legit, 1 = fraud
        probabilities = model.predict_proba(df)[0]  # [prob_legit, prob_fraud]
        
        fraud_probability = float(probabilities[1]) if len(probabilities) > 1 else 0.0
        is_fraud = int(prediction)
        
        # Risk assessment
        risk_level = "low"
        if fraud_probability >= 0.7:
            risk_level = "high"
        elif fraud_probability >= 0.4:
            risk_level = "medium"
        
        return {
            "success": True,
            "is_fraud": bool(is_fraud),
            "fraud_probability": fraud_probability,
            "risk_level": risk_level,
            "features_used": features_data
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Prediction failed: {str(e)}"
        }


def main():
    """Main entry point for the fraud detector"""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "No input data provided. Provide JSON data as command line argument."
        }))
        sys.exit(1)
    
    try:
        # Parse input JSON
        input_data = json.loads(sys.argv[1])
        
        # Run prediction
        result = predict_fraud(input_data)
        
        # Output result as JSON
        print(json.dumps(result))
        sys.exit(0 if result.get("success", False) else 1)
        
    except json.JSONDecodeError as e:
        print(json.dumps({
            "success": False,
            "error": f"Invalid JSON input: {str(e)}"
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
