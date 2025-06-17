// import { useState } from "react";
// import reactLogo from "./assets/react.svg";
// import { invoke } from "@tauri-apps/api/core";
// import "./App.css";

// function App() {
//   const [greetMsg, setGreetMsg] = useState("");
//   const [name, setName] = useState("");

//   async function greet() {
//     // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
//     setGreetMsg(await invoke("greet", { name }));
//   }

//   return (
//     <main className="container">
//       <h1>Welcome to Tauri + React</h1>

//       <div className="row">
//         <a href="https://vitejs.dev" target="_blank">
//           <img src="/vite.svg" className="logo vite" alt="Vite logo" />
//         </a>
//         <a href="https://tauri.app" target="_blank">
//           <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
//         </a>
//         <a href="https://reactjs.org" target="_blank">
//           <img src={reactLogo} className="logo react" alt="React logo" />
//         </a>
//       </div>
//       <p>Click on the Tauri, Vite, and React logos to learn more.</p>

//       <form
//         className="row"
//         onSubmit={(e) => {
//           e.preventDefault();
//           greet();
//         }}
//       >
//         <input
//           id="greet-input"
//           onChange={(e) => setName(e.currentTarget.value)}
//           placeholder="Enter a name..."
//         />
//         <button type="submit">Greet</button>
//       </form>
//       <p>{greetMsg}</p>
//     </main>
//   );
// }

// export default App;

// In App.tsx or App.jsx:
// import React from 'react';

// import WaferScene from './WaferScene.tsx';

// function App() {
//   return (
//     <div style={{ width: 800, height: 800 }}>
//       <WaferScene />
//     </div>
//   );
// }

// export default App;
import React, { useState } from 'react';
import { Box, Flex, Button, Text } from '@mantine/core';

export default function App() {
  const [mode, setMode] = useState<'import' | 'stack' | 'export'>('import');

  const renderContent = () => {
    switch (mode) {
      case 'import':
        return <Text size="lg">Import Mode: Load your data here.</Text>;
      case 'stack':
        return <Text size="lg">Stack Mode: Visualize and manage your stack.</Text>;
      case 'export':
        return <Text size="lg">Export Mode: Configure and export results.</Text>;
      default:
        return null;
    }
  };

  return (
    <Flex style={{ height: '100vh' }}>
      {/* Left sidebar */}
      <Box
        style={{ width: '33%', borderRight: '1px solid #eaeaea' }}
        p="md"
      >
        <Flex direction="column" gap="sm">
          <Button
            variant={mode === 'import' ? 'filled' : 'outline'}
            onClick={() => setMode('import')}
          >
            Import
          </Button>
          <Button
            variant={mode === 'stack' ? 'filled' : 'outline'}
            onClick={() => setMode('stack')}
          >
            Stack
          </Button>
          <Button
            variant={mode === 'export' ? 'filled' : 'outline'}
            onClick={() => setMode('export')}
          >
            Export
          </Button>
        </Flex>
      </Box>

      {/* Main content area */}
      <Box style={{ flex: 1, padding: 'md' }}>
        {renderContent()}
      </Box>
    </Flex>
  );
}
