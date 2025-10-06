# Scheduler Project

This repository contains the source code for the Scheduler project.

## Structure
- `client/` - Angular frontend client code
	- Built with Angular (TypeScript)
	- Project name: `scheduler`
	- To start the client app:
		1. Navigate to the `client` folder
		2. Run `npm install` to install dependencies
		3. Run `npm start` or `ng serve` to start the development server
	- The app will be available at `http://localhost:4200` by default
- `server/` - Node.js backend API
	- Built with Node.js, TypeScript, Express, MongoDB, and Swagger
	- To start the server API:
		1. Navigate to the `server` folder
		2. Run `npm install` to install dependencies
		3. Ensure MongoDB is running locally
		4. Run `npm start` to start the development server
	- The API will be available at `http://localhost:3000`
	- Swagger documentation is available at `http://localhost:3000/api-docs`
	- MongoDB connection will be established automatically on server start

## Prerequisites
- Node.js and npm
- MongoDB (running on default port 27017)

## Getting Started
1. Clone the repository
2. Install dependencies for client and server
3. Ensure MongoDB is running locally
4. Run the development servers

### Setting up MongoDB
1. Install MongoDB Community Edition from [MongoDB Download Center](https://www.mongodb.com/try/download/community)
2. Start the MongoDB service
   - Windows: MongoDB should run as a service automatically
   - Linux/Mac: Run `mongod` in a terminal
3. The server will connect to MongoDB at `mongodb://localhost:27017/scheduler`

## License
Specify your license here.
