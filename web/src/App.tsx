import { GameShell, GameTopbar } from "@freegamestore/games";
import { useEffect, useRef, useState } from "react";
import { startGame } from "./game";
import { useHighScore } from "./hooks/useHighScore";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [highScore, updateHighScore] = useHighScore("beatstar2_hs");

  const handleScore = (n: number) => {
    setScore(n);
    updateHighScore(n);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stop = startGame(canvas, handleScore);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GameShell
      topbar={
        <GameTopbar
          title="Beat Star ⭐"
          score={score}
          highScore={highScore}
        />
      }
    >
      <canvas ref={canvasRef} className="w-full h-full block touch-none" />
    </GameShell>
  );
}
