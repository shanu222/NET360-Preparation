
  # NET360 Preparation App

  This is a code bundle for NET360 Preparation App. The original project is available at https://www.figma.com/design/y9bYMsJLVtoN2SMwfEKBLc/NET360-Preparation-App.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Deploy to Render (Web Service)

  Use these settings when creating a Render Web Service:

  Build Command: `npm install && npm run build`

  Start Command: `npx vite preview --host 0.0.0.0 --port $PORT`

  Notes:
  - Environment: `Node`
  - This app is a frontend Vite app; Render serves the built `dist` output via `vite preview`.
  