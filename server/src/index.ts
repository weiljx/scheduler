import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import connectDB from './config/database.js';
import routes from './routes/index.js';
import { createSchedulerWorker } from './workers/scheduler.worker.js';

const app = express();

// Connect to MongoDB
connectDB();
const port = process.env.PORT || 3000;

app.use(express.json());

const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Scheduler API',
      version: '1.0.0',
      description: 'API documentation for Scheduler Node.js/TypeScript server',
    },
    servers: [
      {
        url: `http://localhost:${port}`,
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
  },
  apis: ['./src/**/*.ts'],
};

let swaggerSpec;
try {
  swaggerSpec = swaggerJSDoc(swaggerOptions);
} catch (error) {
  console.error('Failed to generate Swagger specification:', error);
  throw error;
}
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception detected:', error);
  process.exit(1);
});

const schedulerWorker = createSchedulerWorker();

app.use('/api', routes);

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Swagger docs available at http://localhost:${port}/api-docs`);
  schedulerWorker.start();
});
