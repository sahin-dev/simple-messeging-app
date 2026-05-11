# Parking Report Feature Documentation

## Overview
The Parking Report feature allows users to notify other users about available parking spots. Users can share parking location details including type, cost, amenities, and accessibility information for disabled individuals.

**Key Feature:** Reports automatically expire after **10 minutes** to ensure only fresh, accurate information is displayed.

## Expiration & TTL (Time To Live)
- ⏱️ **Expiration Time:** 10 minutes
- **Behavior:** Reports older than 10 minutes are automatically hidden from all listing/search endpoints
- **Response:** Each report includes:
  - `isExpired`: Boolean flag indicating expiration status
  - `timeRemainingSeconds`: Number of seconds until expiration
  - `expiresAt`: Exact datetime when the report will expire

## Data Model

### ParkingReport Schema
```
- id: String (MongoDB ObjectId)
- user_id: String (Foreign Key to User)
- description: String (Optional - additional details about the spot)
- latitude: Float (Location coordinate)
- longitude: Float (Location coordinate)
- parking_type: ParkingType (SPOT, STREET, GARAGE, LOT)
- parking_cost: ParkingCost (FREE, PAID)
- electric_charging: Boolean (Electric charging availability)
- disabled_facility: Boolean (Disabled accessibility available)
- disabled_facility_location: DisabledFacilityLocation (TOP, RIGHT, BACK, NONE)
- is_active: Boolean (Active status - default: true)
- expiresAt: DateTime (Calculated as createdAt + 10 minutes)
- createdAt: DateTime
- updatedAt: DateTime
```

### Enums

#### ParkingType
- `SPOT` - Designated parking spot
- `STREET` - Street parking
- `GARAGE` - Parking garage
- `LOT` - Parking lot

#### ParkingCost
- `FREE` - Free parking
- `PAID` - Paid parking

#### DisabledFacilityLocation
- `TOP` - Ramp/facility at top of parking spot
- `RIGHT` - Ramp/facility on right side
- `BACK` - Ramp/facility at back
- `NONE` - No disabled facility

## API Endpoints

### 1. Create Parking Report
**Endpoint:** `POST /parking-report`
**Authentication:** Required (JWT Token)
**Description:** Create a new parking report (valid for 10 minutes)

**Request Body:**
```json
{
  "description": "Optional description of the spot",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "parking_type": "SPOT",
  "parking_cost": "FREE",
  "electric_charging": true,
  "disabled_facility": true,
  "disabled_facility_location": "RIGHT"
}
```

**Response (201 Created):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "user_id": "507f1f77bcf86cd799439012",
  "description": "Optional description of the spot",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "parking_type": "SPOT",
  "parking_cost": "FREE",
  "electric_charging": true,
  "disabled_facility": true,
  "disabled_facility_location": "RIGHT",
  "is_active": true,
  "user": {
    "id": "507f1f77bcf86cd799439012",
    "name": "John Doe",
    "nick_name": "johndoe",
    "avatar": "avatar_url"
  },
  "isExpired": false,
  "timeRemainingSeconds": 600,
  "expiresAt": "2026-05-11T10:40:00Z",
  "createdAt": "2026-05-11T10:30:00Z",
  "updatedAt": "2026-05-11T10:30:00Z"
}
```

### 2. Get All Parking Reports
**Endpoint:** `GET /parking-report`
**Authentication:** Not required
**Description:** Retrieve all active parking reports with pagination

**Query Parameters:**
- `page` (default: 1) - Page number
- `limit` (default: 10) - Items per page
- `isActive` (default: true) - Filter by active status

**Response (200 OK):**
```json
{
  "reports": [
    {
      "id": "507f1f77bcf86cd799439011",
      "user_id": "507f1f77bcf86cd799439012",
      "latitude": 40.7128,
      "longitude": -74.0060,
      "parking_type": "SPOT",
      "parking_cost": "FREE",
      "electric_charging": true,
      "disabled_facility": true,
      "disabled_facility_location": "RIGHT",
      "is_active": true,
      "user": {
        "id": "507f1f77bcf86cd799439012",
        "name": "John Doe",
        "nick_name": "johndoe",
        "avatar": "avatar_url"
      },
      "isExpired": false,
      "timeRemainingSeconds": 580,
      "expiresAt": "2026-05-11T10:40:00Z",
      "createdAt": "2026-05-11T10:30:00Z"
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 10
}
```

### 3. Get Nearby Parking Reports
**Endpoint:** `GET /parking-report/nearby`
**Authentication:** Not required
**Description:** Retrieve parking reports near a specific location (only non-expired reports)

**Query Parameters:**
- `latitude` (required) - Center latitude
- `longitude` (required) - Center longitude
- `radius` (default: 5) - Search radius in kilometers
- `page` (default: 1) - Page number
- `limit` (default: 10) - Items per page

**Example:** `GET /parking-report/nearby?latitude=40.7128&longitude=-74.0060&radius=5&page=1&limit=10`

**Response (200 OK):**
```json
{
  "reports": [
    {
      "id": "507f1f77bcf86cd799439011",
      "user_id": "507f1f77bcf86cd799439012",
      "latitude": 40.7135,
      "longitude": -74.0055,
      "parking_type": "GARAGE",
      "parking_cost": "PAID",
      "electric_charging": false,
      "disabled_facility": false,
      "disabled_facility_location": "NONE",
      "is_active": true,
      "user": {
        "id": "507f1f77bcf86cd799439012",
        "name": "John Doe",
        "nick_name": "johndoe",
        "avatar": "avatar_url"
      },
      "isExpired": false,
      "timeRemainingSeconds": 420,
      "expiresAt": "2026-05-11T10:35:00Z",
      "createdAt": "2026-05-11T10:25:00Z"
    }
  ],
  "total": 8,
  "page": 1,
  "limit": 10
}
```

### 4. Get Parking Report by ID
**Endpoint:** `GET /parking-report/:id`
**Authentication:** Not required
**Description:** Retrieve a specific parking report (returns error if expired)

**Response (200 OK):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "user_id": "507f1f77bcf86cd799439012",
  "description": "Great spot near central park",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "parking_type": "SPOT",
  "parking_cost": "FREE",
  "electric_charging": true,
  "disabled_facility": true,
  "disabled_facility_location": "RIGHT",
  "is_active": true,
  "user": {
    "id": "507f1f77bcf86cd799439012",
    "name": "John Doe",
    "nick_name": "johndoe",
    "avatar": "avatar_url",
    "email": "john@example.com"
  },
  "isExpired": false,
  "timeRemainingSeconds": 540,
  "expiresAt": "2026-05-11T10:40:00Z",
  "createdAt": "2026-05-11T10:30:00Z",
  "updatedAt": "2026-05-11T10:30:00Z"
}
```

### 5. Get Parking Reports by User
**Endpoint:** `GET /parking-report/user/:userId`
**Authentication:** Not required
**Description:** Retrieve all non-expired parking reports created by a specific user

**Query Parameters:**
- `page` (default: 1) - Page number
- `limit` (default: 10) - Items per page

**Response (200 OK):**
```json
{
  "reports": [
    {
      "id": "507f1f77bcf86cd799439011",
      "user_id": "507f1f77bcf86cd799439012",
      "latitude": 40.7128,
      "longitude": -74.0060,
      "parking_type": "SPOT",
      "parking_cost": "FREE",
      "electric_charging": true,
      "disabled_facility": true,
      "disabled_facility_location": "RIGHT",
      "is_active": true,
      "user": {
        "id": "507f1f77bcf86cd799439012",
        "name": "John Doe",
        "nick_name": "johndoe",
        "avatar": "avatar_url"
      },
      "createdAt": "2026-05-11T10:30:00Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 10
}
```

### 6. Update Parking Report
**Endpoint:** `PUT /parking-report/:id`
**Authentication:** Required (JWT Token - Owner only)
**Description:** Update a parking report (only the creator can update, returns error if expired)

**Request Body:** (All fields optional)
```json
{
  "description": "Updated description",
  "latitude": 40.7130,
  "longitude": -74.0062,
  "parking_type": "GARAGE",
  "parking_cost": "PAID",
  "electric_charging": false,
  "disabled_facility": true,
  "disabled_facility_location": "TOP",
  "is_active": true
}
```

**Response (200 OK):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "user_id": "507f1f77bcf86cd799439012",
  "description": "Updated description",
  "latitude": 40.7130,
  "longitude": -74.0062,
  "parking_type": "GARAGE",
  "parking_cost": "PAID",
  "electric_charging": false,
  "disabled_facility": true,
  "disabled_facility_location": "TOP",
  "is_active": true,
  "user": {
    "id": "507f1f77bcf86cd799439012",
    "name": "John Doe",
    "nick_name": "johndoe",
    "avatar": "avatar_url"
  },
  "isExpired": false,
  "timeRemainingSeconds": 450,
  "expiresAt": "2026-05-11T10:40:00Z",
  "createdAt": "2026-05-11T10:30:00Z",
  "updatedAt": "2026-05-11T11:45:00Z"
}
```

### 7. Deactivate Parking Report
**Endpoint:** `PUT /parking-report/:id/deactivate`
**Authentication:** Required (JWT Token - Owner only)
**Description:** Deactivate a parking report (mark as no longer available, returns error if expired)

**Response (200 OK):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "user_id": "507f1f77bcf86cd799439012",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "parking_type": "SPOT",
  "parking_cost": "FREE",
  "electric_charging": true,
  "disabled_facility": true,
  "disabled_facility_location": "RIGHT",
  "is_active": false,
  "user": {
    "id": "507f1f77bcf86cd799439012",
    "name": "John Doe",
    "nick_name": "johndoe",
    "avatar": "avatar_url"
  },
  "isExpired": false,
  "timeRemainingSeconds": 300,
  "expiresAt": "2026-05-11T10:40:00Z",
  "createdAt": "2026-05-11T10:30:00Z",
  "updatedAt": "2026-05-11T12:00:00Z"
}
```

### 8. Delete Parking Report
**Endpoint:** `DELETE /parking-report/:id`
**Authentication:** Required (JWT Token - Owner only)
**Description:** Permanently delete a parking report (only the creator can delete)

**Response (200 OK):**
```json
{
  "message": "Parking report deleted successfully"
}
```

## Error Responses

### Not Found (404) - Expired Report
```json
{
  "message": "Parking report with ID 507f1f77bcf86cd799439011 has expired"
}
```

### Not Found (404) - Report Not Found
```json
{
  "message": "Parking report with ID 507f1f77bcf86cd799439999 not found"
}
```

### Unauthorized (403)
```json
{
  "message": "Unauthorized: You can only update your own parking reports"
}
```

### Bad Request (400)
```json
{
  "message": "Validation failed",
  "errors": [
    {
      "field": "latitude",
      "message": "latitude must be a number"
    }
  ]
}
```

## Expiration Behavior

### Timeline Example
- **T+0min**: User creates parking report
  - `isExpired: false`
  - `timeRemainingSeconds: 600`
  
- **T+5min**: Report still visible
  - `isExpired: false`
  - `timeRemainingSeconds: 300`
  
- **T+10min**: Report automatically expires
  - Report removed from all list/search endpoints
  - Direct lookup returns "expired" error
  - `GET /parking-report/:id` returns 404 with "has expired" message

### Automatic Filtering
- **GET /parking-report** - Excludes reports older than 10 minutes
- **GET /parking-report/nearby** - Only returns non-expired reports within radius
- **GET /parking-report/user/:userId** - Shows only recent reports from user
- **GET /parking-report/:id** - Returns error if report has expired

## Usage Examples

### Frontend Implementation (TypeScript/Angular)

```typescript
// Create a parking report
const createReport = () => {
  const parkingData = {
    description: "Free spot near train station",
    latitude: 40.7128,
    longitude: -74.0060,
    parking_type: 'SPOT',
    parking_cost: 'FREE',
    electric_charging: true,
    disabled_facility: true,
    disabled_facility_location: 'RIGHT'
  };
  
  return http.post('/parking-report', parkingData);
};

// Search nearby parking
const searchNearby = (lat: number, lon: number, radius: number = 5) => {
  return http.get('/parking-report/nearby', {
    params: {
      latitude: lat,
      longitude: lon,
      radius: radius
    }
  });
};

// Format expiration time for display
const formatTimeRemaining = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
};

// Handle expiring reports in UI
const handleParkingReports = (reports: any[]) => {
  return reports.map(report => ({
    ...report,
    displayTimeRemaining: formatTimeRemaining(report.timeRemainingSeconds),
    shouldShowWarning: report.timeRemainingSeconds < 60, // Show warning in last minute
    isStale: report.isExpired
  }));
};

// Auto-refresh nearby parking every 30 seconds
const startAutoRefresh = (lat: number, lon: number) => {
  return interval(30000).pipe(
    switchMap(() => searchNearby(lat, lon)),
    map(response => handleParkingReports(response.reports))
  );
};

// Deactivate when leaving
const markSpaceAsEmpty = (reportId: string) => {
  return http.put(`/parking-report/${reportId}/deactivate`, {});
};
```

## Database Migration

Run the following to apply the schema changes:

```bash
npx prisma migrate dev --name add-parking-report-with-expiration
```

This will:
1. Create the `ParkingReport` collection in MongoDB
2. Create the parking-related enums
3. Add `expiresAt` field for tracking report expiration
4. Update the User model to include the relation

## Features Implemented

✅ Create parking reports with complete details
✅ Search all parking reports (with pagination)
✅ Search nearby parking reports (within specified radius)
✅ Get parking reports by user
✅ Get specific parking report by ID
✅ Update parking reports (owner only)
✅ Deactivate parking reports when spot is taken
✅ Delete parking reports (permanent removal)
✅ User information included in responses
✅ Geolocation-based search with distance calculation
✅ **Automatic 10-minute expiration for all reports**
✅ **Expired reports automatically hidden from searches**
✅ **Expiration metadata in responses (timeRemaining, isExpired, expiresAt)**
✅ **Errors returned when trying to access/update expired reports**

## Security Features

- ✅ JWT authentication for create/update/delete operations
- ✅ Ownership verification (users can only modify their own reports)
- ✅ Input validation using DTOs and class-validator
- ✅ Authorization checks on protected endpoints
- ✅ Automatic stale data prevention through TTL mechanism

## Expiration & Performance Notes

- Reports are **logically filtered** using `createdAt` timestamps (no external jobs needed)
- Database queries use `createdAt >= now() - 10 minutes` for efficiency
- No scheduled cleanup jobs required
- Expired reports remain in database for historical tracking (optional cleanup can be added)

## Future Enhancements

- [ ] Add parking spot images
- [ ] Add rating system for parking spots
- [ ] Add notification system when user posts nearby
- [ ] Add favorites/bookmarks for frequent spots
- [ ] Add real-time updates via WebSocket
- [ ] Add analytics dashboard for popular parking areas
- [ ] Integration with Google Maps API for better location services
- [ ] Configurable expiration time (currently fixed at 10 minutes)
- [ ] Database TTL index to auto-delete old records
- [ ] Refresh endpoint to extend report validity
