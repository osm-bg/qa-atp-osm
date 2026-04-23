import fs from 'fs';
const configs = JSON.parse(fs.readFileSync('config.json'));

function preprocess_atp_data(data) {
    return data.features
	.filter(feature => feature.geometry && configs.allowed_countries.includes(feature.properties['addr:country']))
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
}

async function fetch_atp_data({ spider_name, spider_url}, run) {
	let response;
	const cache_path = `cache/${spider_name}-${run}.geojson`;
	const local_spider_exists = fs.existsSync('cache') && fs.existsSync(cache_path);
	if(local_spider_exists) {
		response = fs.createReadStream(cache_path);
	}
	if(spider_url && spider_url.startsWith('https')) {
		response = await fetch(spider_url);
	}
	else {
		response = await fetch(`${configs.atp_url}/runs/${run}/output/${spider_name}.geojson`);
	}
	const data = await response.json();
	if(!local_spider_exists) {
		if(!fs.existsSync('cache')) {
			fs.mkdirSync('cache');
		}
		fs.writeFileSync(cache_path, JSON.stringify(data));
	}
	return preprocess_atp_data(data);
}

export async function populate_atp_cache(spiders, atp_cache) {
    const last_run = await get_last_atp_run();
	let promises = [];
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
									atp_item.coordinates = [lat, lon];
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
	return Promise.all(promises);
}

async function get_last_atp_run() {
	const alltheplaces_latest_run = `${configs.atp_url}/runs/latest.json`;
	const response = await fetch(alltheplaces_latest_run);
	const data = await response.json();
	return data.run_id;
}