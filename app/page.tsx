import { PortfolioNav } from "@/components/PortfolioNav";
import TrainerGate from "@/components/TrainerGate";

export default function Home() {
  return (
    <div className="relative min-h-full flex flex-1 justify-center bg-zinc-100/90 dark:bg-zinc-950">
      <PortfolioNav />
      <TrainerGate />
    </div>
  );
}
