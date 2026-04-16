import React, { useState, useEffect } from 'react';
import { ChevronLeft, Leaf, Droplets, Sun } from 'lucide-react';
import PlantCard from '../components/PlantCard';

const PLANT_TYPES = ['Trees', 'Shrubs', 'Perennials', 'Grasses', 'Groundcover', 'Succulents'];
const REGIONS = ['Northeast', 'Southeast', 'Midwest', 'Mountain West', 'Pacific Northwest', 'California', 'Southwest', 'Gulf Coast'];

function BrowseTab({ onSelectPlant, onAddToList }) {
  const [plants, setPlants] = useState([]);
  const [filteredPlants, setFilteredPlants] = useState([]);
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('All');
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [stats, setStats] = useState({ total: 0, byType: [], byZone: [], byRegion: [] });

  useEffect(() => {
    fetchStats();
    fetchPlants();
  }, []);

  useEffect(() => {
    filterPlants();
  }, [plants, searchTerm, selectedType, selectedRegion]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/plants/stats/counts');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchPlants = async () => {
    try {
      const res = await fetch('/api/plants');
      const data = await res.json();
      setPlants(data);
    } catch (error) {
      console.error('Error fetching plants:', error);
    }
  };

  const filterPlants = () => {
    let filtered = plants;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.common_name.toLowerCase().includes(term) ||
        p.botanical_name.toLowerCase().includes(term)
      );
    }

    if (selectedType !== 'All') {
      filtered = filtered.filter(p => p.plant_type === selectedType);
    }

    if (selectedRegion !== 'All') {
      filtered = filtered.filter(p => p.region && p.region.includes(selectedRegion));
    }

    setFilteredPlants(filtered);
  };

  if (selectedPlant) {
    return (
      <div className="h-full flex flex-col bg-plant-bg overflow-hidden">
        <div className="bg-plant-card border-b border-plant-border p-4 flex items-center gap-3">
          <button onClick={() => setSelectedPlant(null)} className="touch-target">
            <ChevronLeft size={24} className="text-plant-accent" />
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-plant-text">{selectedPlant.common_name}</h1>
            <p className="text-sm text-plant-muted italic">{selectedPlant.botanical_name}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-plant-card2 border border-plant-border rounded p-3">
              <p className="text-xs text-plant-muted mb-1">Type</p>
              <p className="font-semibold text-plant-text">{selectedPlant.plant_type}</p>
            </div>
            <div className="bg-plant-card2 border border-plant-border rounded p-3">
              <p className="text-xs text-plant-muted mb-1">Zone</p>
              <p className="font-semibold text-plant-text">{selectedPlant.hardiness_zone}</p>
            </div>
            <div className="bg-plant-card2 border border-plant-border rounded p-3">
              <p className="text-xs text-plant-muted mb-1">Water</p>
              <p className="font-semibold text-plant-text flex items-center gap-2">
                <Droplets size={16} /> {selectedPlant.water_needs}
              </p>
            </div>
            <div className="bg-plant-card2 border border-plant-border rounded p-3">
              <p className="text-xs text-plant-muted mb-1">Sun</p>
              <p className="font-semibold text-plant-text flex items-center gap-2">
                <Sun size={16} /> {selectedPlant.sun_requirement}
              </p>
            </div>
          </div>

          {selectedPlant.mature_height && (
            <div className="bg-plant-card2 border border-plant-border rounded p-3">
              <p className="text-xs text-plant-muted mb-1">Mature Size</p>
              <p className="font-semibold text-plant-text">{selectedPlant.mature_height} H × {selectedPlant.mature_width} W</p>
            </div>
          )}

          {selectedPlant.bloom_color && (
            <div className="bg-plant-card2 border border-plant-border rounded p-3">
              <p className="text-xs text-plant-muted mb-1">Bloom</p>
              <p className="font-semibold text-plant-text">{selectedPlant.bloom_color} ({selectedPlant.season})</p>
            </div>
          )}

          {selectedPlant.region && (
            <div className="bg-plant-card2 border border-plant-border rounded p-3">
              <p className="text-xs text-plant-muted mb-1">Regions</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedPlant.region.split(',').map((r, i) => (
                  <span key={i} className="text-xs bg-plant-border text-plant-text px-2 py-1 rounded">
                    {r.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedPlant.description && (
            <div className="bg-plant-card2 border border-plant-border rounded p-3">
              <p className="text-xs text-plant-muted mb-2">About</p>
              <p className="text-sm text-plant-text leading-relaxed">{selectedPlant.description}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-plant-border">
          <button
            onClick={() => {
              onAddToList(selectedPlant);
              setSelectedPlant(null);
            }}
            className="w-full touch-target bg-plant-accent hover:bg-plant-accent/90 text-white font-semibold rounded-lg py-3 transition-colors"
          >
            Add to List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-plant-bg overflow-hidden">
      <div className="bg-plant-card border-b border-plant-border p-4">
        <h1 className="text-xl font-bold text-plant-text mb-1">Open Plant IQ</h1>
        <p className="text-xs text-plant-muted">{stats.total || plants.length} plants • {stats.byZone?.length ? `Zones ${stats.byZone[0].hardiness_zone}–${stats.byZone[stats.byZone.length - 1].hardiness_zone}` : ''}</p>
      </div>

      <div className="p-4 border-b border-plant-border space-y-3">
        <input
          type="text"
          placeholder="Search by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-plant-card2 border border-plant-border rounded px-3 py-2 text-plant-text placeholder-plant-muted outline-none"
        />

        <div className="space-y-2">
          <p className="text-xs text-plant-muted font-semibold">Type</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {['All', ...PLANT_TYPES].map(type => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`touch-target whitespace-nowrap px-3 py-1 rounded transition-colors ${
                  selectedType === type
                    ? 'bg-plant-accent text-white'
                    : 'bg-plant-card2 border border-plant-border text-plant-text'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-plant-muted font-semibold">Region</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {['All', ...REGIONS].map(region => (
              <button
                key={region}
                onClick={() => setSelectedRegion(region)}
                className={`touch-target whitespace-nowrap px-3 py-1 rounded transition-colors text-sm ${
                  selectedRegion === region
                    ? 'bg-plant-accent text-white'
                    : 'bg-plant-card2 border border-plant-border text-plant-text'
                }`}
              >
                {region}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredPlants.length === 0 ? (
          <p className="text-center text-plant-muted py-8">No plants found</p>
        ) : (
          filteredPlants.map(plant => (
            <PlantCard
              key={plant.id}
              plant={plant}
              onTap={() => setSelectedPlant(plant)}
              onAddClick={onAddToList}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default BrowseTab;
