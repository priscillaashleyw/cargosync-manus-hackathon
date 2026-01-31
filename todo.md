# Bok Seng Logistics Optimization Platform - TODO

## Phase 1: Database Schema & Data Import
- [x] Create trucks table schema
- [x] Create SKUs table schema
- [x] Create orders table schema
- [x] Create order_items table schema
- [x] Create personnel table schema
- [x] Create delivery_runs table schema
- [x] Create delivery_run_orders table schema
- [x] Create load_plan table schema
- [x] Create zipcode_zones table schema
- [x] Import truck data from Excel
- [x] Import orders data from Excel
- [x] Import SKU/product data from Excel

## Phase 2: Core Backend API
- [x] Trucks CRUD API endpoints
- [x] SKUs CRUD API endpoints
- [x] Orders CRUD API endpoints
- [x] Personnel CRUD API endpoints
- [x] Delivery runs CRUD API endpoints

## Phase 3: Optimization Engine
- [x] 3D bin packing algorithm
- [x] Weight distribution calculation
- [x] Delivery sequence optimization
- [x] Optimization API endpoint

## Phase 4: Frontend Dashboard
- [x] Main dashboard layout with sidebar navigation
- [x] Trucks management page
- [x] SKUs/Products management page
- [x] Orders management page
- [x] Personnel management page
- [x] Delivery runs planning page
- [x] Optimization page with order selection

## Phase 5: 3D Visualization
- [x] Three.js truck container visualization
- [x] Item placement rendering with colors
- [x] Interactive controls (rotate, zoom, pan)
- [x] Item hover/click details
- [x] Weight distribution heatmap (Center of Gravity indicator)

## Phase 6: Map & Route Visualization
- [x] Singapore map with Google Maps
- [x] Delivery route polylines
- [x] Delivery sequence markers
- [x] Zone color coding

## Phase 7: Delivery Tracking
- [x] Delivery tracker dashboard
- [x] Mark order as delivered functionality
- [x] Truck availability status
- [x] Deploy button with driver notification (Start/Complete run)

## Bugs
- [ ] Fix sign-in authentication issue

## Phase 8: Improvements (New Requirements)

### 1. Global Cross-Truck Optimization
- [x] Implement Stage A: Auto-assign orders to trucks by delivery zones
- [x] Implement Stage B: Optimize route within each truck (TSP/VRP)
- [x] Add "Auto Optimize Plan" button for one-click optimization
- [ ] Optional: Add "lock truck assignment" override feature

### 2. Fixed Starting Location
- [x] Set Tuas 639405 as default depot location
- [x] Add configurable depot setting
- [x] Ensure all routing/ETA calculations start from depot

### 3. Availability & Auto Status Updates
- [x] Auto update truck status: Available → On Delivery when dispatched
- [x] Auto update driver/helper status: Available → Assigned when dispatched
- [x] Auto revert statuses when route completes
- [x] Prevent assignment to unavailable trucks/drivers

### 4. Live Tracking
- [x] Add Live Tracking page/panel
- [x] Show current truck location on map
- [x] Show route progress (completed vs remaining stops)
- [x] Show updated ETA
- [x] Implement simulated truck movement along route polyline

### 5. Dimensions & Weights Standardization
- [x] Standardize all dimensions to cm
- [x] Standardize all weights to kg
- [x] Add input validation (no negative values, numeric types)
- [x] Auto-compute missing values and flag for review

### 6. Helper Option
- [x] Add helper requirement field: No helper / 1 helper / 2 helpers
- [x] Consider helper availability in optimization
- [x] Show helper requirement in UI and dispatch summary

### 7. Load Plan Visualization Redesign
- [x] Remove coordinate input requirement
- [x] Output placement as Front / Middle / Back
- [x] Redesign to truck-like view with labeled sections
- [x] Place earlier drop-offs near back for easier access
- [x] Keep heavy items low/centered for stability

## Phase 9: Database Cleanup & Geocoding

### Orders Table Update
- [x] Remove address column from orders table
- [x] Geocode all Singapore zipcodes to get actual lat/lng
- [x] Update all orders with real coordinates
- [x] Verify map display shows correct locations

## Bug Fixes
- [x] Fix map visualization to use correct lat/lng from orders database

## Phase 10: Algorithm Integration
- [x] Analyze route_optimizer_v3.py algorithm
- [x] Integrate V3 algorithm with multi-trip support and parallel deployment
- [x] Add Best-Fit Decreasing (BFD) bin packing
- [x] Add zone-based truck assignment
- [x] Add depot reload time between trips
- [x] Update AutoOptimizePage UI for new algorithm output

## Bug Fixes (Continued)
- [x] Fix load plan to use correct SKU dimensions from database

## Phase 11: Bulk Import Feature
- [x] Create Excel parsing utility for server-side
- [x] Add bulk import endpoint for trucks
- [x] Add bulk import endpoint for SKUs
- [x] Add bulk import endpoint for personnel
- [x] Add file upload UI to Trucks page
- [x] Add file upload UI to SKUs page
- [x] Add file upload UI to Personnel page
- [x] Add sample template downloads

## Phase 12: Reset Orders Feature
- [x] Add reset orders endpoint to backend
- [x] Add reset button with confirmation dialog to Orders page
- [x] Test reset functionality
