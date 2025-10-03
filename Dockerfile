# Stage 1: Build the React application
# This stage uses a Node.js image to install dependencies and build the static files.
FROM node:18-alpine AS build
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the application for production
RUN npm run build

# Stage 2: Serve the application using Nginx
# This stage uses a lightweight Nginx image to serve the built static files.
FROM nginx:1.25-alpine

# Copy the static files from the build stage to the Nginx public directory
COPY --from=build /app/dist /usr/share/nginx/html

# Copy the custom Nginx configuration to handle SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80 to allow traffic to the web server
EXPOSE 8080

# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
