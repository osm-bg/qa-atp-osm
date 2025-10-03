import fs from 'fs';
const configs = JSON.parse(fs.readFileSync('config.json'));

function preprocess_atp_data(data) {
    data.features = data.features
	.filter(feature => feature.geometry && configs.allowed_countries.includes(feature.properties['addr:country']));
	data.features.forEach(item => {
		item.tags = item.properties;
        delete item.properties;
        item.coordinates = item.geometry.coordinates.toReversed();
        delete item.geometry;
		delete item.type;

		if(item.tags.opening_hours === 'Mo-Su 00:00-24:00') {
			item.tags.opening_hours = '24/7';
		}
    });
	return data.features;
}

async function fetch_atp_data(spider, run) {
	let response;
	if(spider.startsWith('https')) {
		response = await fetch(spider);
	}
	else {
		response = await fetch(`${configs.atp_url}/runs/${run}/output/${spider}.geojson`);
	}
	const data = await response.json();
	return preprocess_atp_data(data);
}

export async function populate_atp_cache(spiders, atp_cache) {
    const last_run = await get_last_atp_run();
	let promises = [];
	spiders.forEach(({atp_spider, spider_url}, index) => {
		const promise = new Promise(resolve => setTimeout(async () => {
			console.log(`Fetching ATP data for ${atp_spider}`);
			if(!atp_cache[atp_spider]) {
				try {
					atp_cache[atp_spider] = await fetch_atp_data(spider_url?spider_url:atp_spider, last_run);
				}
				catch(error) {
					console.error(atp_spider, error);
					atp_cache[atp_spider] = [];
				}
			}
			resolve();
		}, 1500 * index));
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