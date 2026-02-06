# Bok Seng Logistics Optimization Platform

A comprehensive full-stack logistics platform designed to optimize delivery operations for Bok Seng Logistics. This application integrates fleet management, intelligent route planning, and 3D cargo visualization to streamline the logistics workflow.

##  Features

### Core Management
- **Fleet Management**: centralized database for managing trucks and vehicle specifications.
- **Resource Tracking**: CRUD operations for Personnel (Drivers/Helpers) and SKUs.
- **Order Management**: Detailed order tracking with automated geocoding for Singapore zip codes.
- **Bulk Import**: Support for Excel file uploads to bulk import Trucks, SKUs, and Personnel data.

### Intelligent Optimization Engine
- **Global Cross-Truck Optimization**: Auto-assigns orders to trucks based on delivery zones.
- **Route Optimization**: Solves TSP/VRP for optimal delivery sequences starting from the Tuas depot.
- **3D Bin Packing**: Calculates optimal cargo loading plans considering weight distribution and "First-In-Last-Out" accessibility.
- **Helper Logic**: Automatically factors in requirements for extra delivery helpers (1 or 2) during assignment.

### Visualization & Tracking
- **3D Load Plan**: Interactive 3D visualization of truck cargo using Three.js, showing item placement and center of gravity.
- **Route Mapping**: Google Maps integration to visualize delivery routes, zones, and stops.
- **Live Tracking**: Real-time simulation of truck movements, estimated times of arrival (ETA), and delivery status updates.

## Tech Stack

**Frontend**
- **Framework**: [React](https://react.dev/) (via [Vite](https://vitejs.dev/))
- **Language**: TypeScript
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/) (Radix UI)
- **Visualization**: [Three.js](https://threejs.org/) (@react-three/fiber, @react-three/drei)
- **State/Data**: [TanStack Query](https://tanstack.com/query/latest)

**Backend**
- **Runtime**: Node.js
- **API**: [tRPC](https://trpc.io/) (End-to-end typesafe APIs)
- **Server**: Express
- **Database**: MySQL
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)

## Installation & Setup

### Prerequisites
- Node.js (v20+ recommended)
- pnpm (Project uses `pnpm` package manager)
- MySQL Database

### 1. Clone the repository
```bash
git clone <repository-url>
cd cargosync-manus-hackathon
```

### 2. Install dependencies
```bash
pnpm install
```

### 3. Database setup
Ensure your **MySQL** database is running and properly configured in your environment variables.

Run database migrations to create the schema (Trucks, Orders, Users, etc.):
```bash
pnpm db:push
```

### 4. Start development server
```bash
pnpm dev
```
