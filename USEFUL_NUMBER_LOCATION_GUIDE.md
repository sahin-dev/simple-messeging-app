# Useful Number Module - Location-Based Search Guide

## Overview
The Useful Number module now supports MongoDB location-based searching using GeoJSON and geospatial queries.

## Schema Changes

### New Fields
- `geolocation`: A GeoJSON Point field that stores coordinates in [longitude, latitude] format for MongoDB geospatial indexing.

```prisma
model UsefullNumber {
  id String @id @default(auto()) @map("_id") @db.ObjectId
  title String
  phone String
  location location        // Legacy location field
  geolocation Point?       // New GeoJSON field for geospatial queries
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("useful_numbers")
}

type location {
  latitude Float
  longitude Float
}
```

## API Endpoints

### 1. Create Useful Number (with location)
**POST** `/useful-number`

```json
{
  "title": "Emergency Hospital",
  "phone": "1234567890",
  "latitude": 40.7128,
  "longitude": -74.0060
}
```

### 2. Get Nearby Useful Numbers
**GET** `/useful-number/nearby/location`

Query Parameters:
- `latitude` (number, required): User's latitude (-90 to 90)
- `longitude` (number, required): User's longitude (-180 to 180)
- `radiusInMeters` (number, optional): Search radius in meters (default: 5000 = 5km)
- `page` (number, optional): Page number for pagination (default: 1)
- `limit` (number, optional): Items per page (default: 10, max: 100)

Example:
```
GET /useful-number/nearby/location?latitude=40.7128&longitude=-74.0060&radiusInMeters=10000&page=1&limit=20
```

Response:
```json
{
  "numbers": [
    {
      "id": "507f1f77bcf86cd799439011",
      "title": "Emergency Hospital",
      "phone": "1234567890",
      "location": {
        "latitude": 40.7128,
        "longitude": -74.0060
      },
      "geolocation": {
        "type": "Point",
        "coordinates": [-74.0060, 40.7128]
      },
      "distance": 1250.5,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20,
  "radiusInMeters": 10000,
  "userLocation": {
    "latitude": 40.7128,
    "longitude": -74.0060
  }
}
```

### 3. Search by Text
**GET** `/useful-number/search`

Query Parameters:
- `query` (string, required): Search term for title or phone
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 10)

### 4. Get All Useful Numbers (Paginated)
**GET** `/useful-number`

Query Parameters:
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 10)

### 5. Get Useful Number by ID
**GET** `/useful-number/:id`

### 6. Update Useful Number
**PUT** `/useful-number/:id`

```json
{
  "title": "Updated Hospital Name",
  "phone": "9876543210",
  "latitude": 40.7130,
  "longitude": -74.0061
}
```

### 7. Delete Useful Number
**DELETE** `/useful-number/:id`

## MongoDB Setup

Ensure you have a geospatial index on the `useful_numbers` collection:

```javascript
db.useful_numbers.createIndex({ geolocation: "2dsphere" })
```

This index is required for efficient geospatial queries.

## How It Works

1. **Data Storage**: When creating or updating a useful number with coordinates, the system:
   - Stores the location in the legacy `location` field (latitude/longitude object)
   - Creates a GeoJSON Point in the `geolocation` field with coordinates as [longitude, latitude]

2. **Location-Based Search**: Uses MongoDB's `$geoNear` aggregation pipeline to:
   - Find all documents within the specified radius
   - Calculate distance from the user's location
   - Sort by distance automatically
   - Support pagination

3. **Distance Calculation**: MongoDB uses spherical distance calculation, which accounts for Earth's curvature and provides accurate distances.

## Example Usage

```bash
# Find all useful numbers within 5km of a location
curl "http://localhost:3000/useful-number/nearby/location?latitude=40.7128&longitude=-74.0060&radiusInMeters=5000&page=1&limit=10"

# Find within 10km
curl "http://localhost:3000/useful-number/nearby/location?latitude=40.7128&longitude=-74.0060&radiusInMeters=10000"

# With pagination
curl "http://localhost:3000/useful-number/nearby/location?latitude=40.7128&longitude=-74.0060&radiusInMeters=15000&page=2&limit=20"
```

## Distance Units

The search radius is specified in **meters**. Common conversions:
- 1 km = 1000 meters
- 5 km = 5000 meters
- 10 km = 10000 meters
- 50 km = 50000 meters

## Performance Notes

- Geospatial queries are efficient with the `2dsphere` index
- Results are sorted by distance automatically
- The distance field is included in the response for each result
- Pagination works with geospatial queries efficiently
