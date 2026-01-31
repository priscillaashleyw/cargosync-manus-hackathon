import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import TrucksPage from "./pages/TrucksPage";
import OrdersPage from "./pages/OrdersPage";
import PersonnelPage from "./pages/PersonnelPage";
import DeliveryRunsPage from "./pages/DeliveryRunsPage";
import OptimizePage from "./pages/OptimizePage";
import AutoOptimizePage from "./pages/AutoOptimizePage";
import LiveTrackingPage from "./pages/LiveTrackingPage";
import SKUsPage from "./pages/SKUsPage";
import DeliveryRunDetailPage from "./pages/DeliveryRunDetailPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/optimize" component={OptimizePage} />
      <Route path="/auto-optimize" component={AutoOptimizePage} />
      <Route path="/live-tracking" component={LiveTrackingPage} />
      <Route path="/delivery-runs" component={DeliveryRunsPage} />
      <Route path="/delivery-runs/:id" component={DeliveryRunDetailPage} />
      <Route path="/orders" component={OrdersPage} />
      <Route path="/trucks" component={TrucksPage} />
      <Route path="/skus" component={SKUsPage} />
      <Route path="/personnel" component={PersonnelPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
