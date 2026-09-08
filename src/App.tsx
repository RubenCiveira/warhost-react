import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import RequireAccess from "./components/RequireAccess";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Verify from "./pages/Verify";
import Home from "./pages/Home";
import ArmyList from "./pages/armies/ArmyList";
import ArmyEditor from "./pages/armies/ArmyEditor";
import GameList from "./pages/games/GameList";
import GameNew from "./pages/games/GameNew";
import GameLive from "./pages/games/GameLive";
import AssociationList from "./pages/associations/AssociationList";
import AssociationDetail from "./pages/associations/AssociationDetail";
import CatalogBooks from "./pages/catalog/CatalogBooks";
import ArmyBuilder from "./pages/catalog/ArmyBuilder";
import CatalogBook from "./pages/catalog/CatalogBook";
import RulesIndex from "./pages/rules/RulesIndex";
import MissionCards from "./pages/missions/MissionCards";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify" element={<Verify />} />
      <Route
        element={
          <RequireAccess>
            <Layout />
          </RequireAccess>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/ejercitos" element={<ArmyList />} />
        <Route path="/ejercitos/nuevo" element={<ArmyEditor />} />
        <Route path="/ejercitos/:armyId" element={<ArmyEditor />} />
        <Route path="/partidas" element={<GameList />} />
        <Route path="/partidas/nueva" element={<GameNew />} />
        <Route path="/partidas/:gameId" element={<GameLive />} />
        <Route path="/asociaciones" element={<AssociationList />} />
        <Route path="/asociaciones/:associationId" element={<AssociationDetail />} />
        <Route path="/facciones" element={<CatalogBooks />} />
        <Route path="/facciones/:bookKey" element={<CatalogBook />} />
        <Route path="/facciones/:bookKey/crear" element={<ArmyBuilder />} />
        <Route path="/reglas" element={<RulesIndex />} />
        <Route path="/misiones" element={<MissionCards />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
