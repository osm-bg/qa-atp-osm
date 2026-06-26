import fs from 'fs';

import { calculate_distance } from './utils.js';

const configs = JSON.parse(fs.readFileSync('config.json'));

function preprocess_atp_data(data, spider) {
	const filtered = data.features
		.filter(feature => spider.atp_options?.skip_filtering ||
			spider.atp_options?.remove && !spider.atp_options?.remove.some(remove_condition =>
				remove_condition.key in feature.properties &&
				feature.properties[remove_condition.key] === remove_condition.value
			) ||
			feature.geometry && configs.allowed_countries.includes(feature.properties['addr:country'])
		)
		.map(item => {
			item.tags = item.properties;
			delete item.properties;
			item.coordinates = item.geometry.coordinates.toReversed()
			.map(coord => parseFloat(coord.toFixed(5)));
			delete item.geometry;
			delete item.type;
			
			if(item.tags.opening_hours === 'Mo-Su 00:00-24:00') {
				item.tags.opening_hours = '24/7';
			}
			return item;
		});
	console.log(`Preprocessing ATP data, initial count: ${data.features.length}, filtered: ${filtered.length}`);
	return filtered;
}

async function fetch_atp_data(spider, run) {
	let response;
	const { spider_name, spider_url } = spider;
	const cache_path = `cache/${spider_name}-${run}.geojson`;
	const local_spider_exists = fs.existsSync('cache') && fs.existsSync(cache_path);
	console.log(cache_path, local_spider_exists);
	let data;
	if(local_spider_exists) {
		data = JSON.parse(fs.readFileSync(cache_path));
	}
	else{
		if(spider_url && spider_url.startsWith('https')) {
			response = await fetch(spider_url);
		}
		else {
			response = await fetch(`${configs.atp_url}/runs/${run}/output/${spider_name}.geojson`);
		}
		data = await response.json();
		if(!fs.existsSync('cache')) {
			fs.mkdirSync('cache');
		}
		fs.writeFileSync(cache_path, JSON.stringify(data));
	}
	return preprocess_atp_data(data, spider);
}

export async function populate_atp_cache(spiders) {
    const last_run = await get_last_atp_run();
	let promises = [];
	let atp_cache = {};
	spiders.forEach((spider, index) => {
		const { spider_name, spider_url } = spider;
		const promise = new Promise(resolve => setTimeout(async () => {
			console.log(`Fetching ATP data for ${spider_name}`);
			if(!atp_cache[spider_name]) {
				try {
					atp_cache[spider_name] = await fetch_atp_data(spider, last_run);
					for(const osm_subtype of spider.osm) {
						if(osm_subtype.overwrite_locations) {
							for(const overwrite_location of osm_subtype.overwrite_locations) {
								const {key, value} = osm_subtype;
								const {ref, lat, lon} = overwrite_location;
								const atp_item = atp_cache[spider_name].find(item => 
									item.tags.ref === ref &&
									item.tags[key] === value
								);
								if(atp_item) {
									const distance = calculate_distance({coordinates: [lat, lon]}, atp_item);
									if(distance <= configs.max_distance) {
										console.warn(`Overwriting location for ${spider_name} ref ${ref} with distance ${distance.toFixed(2)}m`);
									}
									atp_item.coordinates[0] = lat;
									atp_item.coordinates[1] = lon;
								}
							}
						}
					}
				}
				catch(error) {
					console.error(spider_name, error);
					atp_cache[spider_name] = [];
				}
			}
			resolve();
		}, 250 * index));
		promises.push(promise);
	});
	return Promise.all(promises)
	.then(() => atp_cache);
}

async function get_last_atp_run() {
	const alltheplaces_latest_run = `${configs.atp_url}/runs/latest.json`;
	const response = await fetch(alltheplaces_latest_run);
	const data = await response.json();
	return data.run_id;
}