import { Route, MemoryRouter as Router, Routes } from 'react-router-dom';
import './App.css';
import Layout from './layout';

export default function App() {
	return (
		<Router>
			<Routes>
				<Route path="/" element={<Layout />} />
			</Routes>
		</Router>
	);
}
