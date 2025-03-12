# File Sharing App

A modern file sharing application built with cutting-edge web technologies.

## 🚀 Quick Start

### Prerequisites

- macOS (Intel or Apple Silicon)
- Terminal access

### Setup Instructions

1. **Install Homebrew**
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

2. **Install Node Version Manager (NVM)**
   ```bash
   brew install nvm
   ```
   
   Add NVM to your shell profile:
   ```bash
   echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
   echo '[ -s "$(brew --prefix)/opt/nvm/nvm.sh" ] && . "$(brew --prefix)/opt/nvm/nvm.sh"' >> ~/.zshrc
   echo '[ -s "$(brew --prefix)/opt/nvm/etc/bash_completion.d/nvm" ] && . "$(brew --prefix)/opt/nvm/etc/bash_completion.d/nvm"' >> ~/.zshrc
   ```
   
   Reload your profile:
   ```bash
   source ~/.zshrc
   ```

3. **Install Node.js**
   ```bash
   nvm install 22
   nvm use 22
   ```

4. **Install Dependencies**
   ```bash
   npm install
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```
   
   The application will be available at [http://localhost:3000](http://localhost:3000)

## 📋 Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm start` - Run the production build
- `npm test` - Run tests

## 🛠️ Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS

## 📁 Project Structure

```
file-sharing-app/
├── public/         # Static assets
├── src/            # Source code
│   ├── components/ # React components
│   ├── pages/      # Application pages
│   ├── styles/     # CSS styles
│   └── utils/      # Utility functions
├── .env.example    # Example environment variables
└── README.md       # This file
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

