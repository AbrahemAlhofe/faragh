// Stopwatch Timer

import { useEffect, useState } from "react";

export default function Timer({
  duration = 0, // total seconds to count up to (optional)
  running = true, // whether the timer should start running immediately (optional)
  onComplete,
}: {
  duration?: number;
  onComplete?: () => void;
  running?: boolean;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
        if (!running) return; // don't update if not running
        setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (duration > 0 && elapsedSeconds >= duration) {
      onComplete?.();
    }
  }, [elapsedSeconds, duration, onComplete]);

  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  const formatTime = (time: number) => time.toString().padStart(2, "0");

  return (
    <div>
      <div>
        {formatTime(hours)}:{formatTime(minutes)}:{formatTime(seconds)}
      </div>
    </div>
  );
}
