var map;
        //Note that the typeahead parameter is set to true.
        var geocodeServiceUrlTemplate =
            "https://{azMapsDomain}/search/{searchType}/json?typeahead=true&api-version=1&query={query}&language={language}&lon={lon}&lat={lat}&countrySet={countrySet}&view=Auto";
        var lat;
        var lon;
        async function GetMap() {
            //Initialize a map instance.
            map = new atlas.Map("myMap", {
                view: "Auto",

                //Add authentication details for connecting to Azure Maps.
                authOptions: {
                    //Use Azure Active Directory authentication.

                    //Alternatively, use an Azure Maps key. Get an Azure Maps key at https://azure.com/maps. NOTE: The primary key should be used as the key.
                    authType: "subscriptionKey",
                    subscriptionKey: "<KEY HERE>",
                },
            });

            //Wait until the map resources are ready.
            map.events.add("ready", function () {
                //Create a data source to store the data in.
                datasource = new atlas.source.DataSource();
                map.sources.add(datasource);

                //Add a layer for rendering point data.
                var resultLayer = new atlas.layer.SymbolLayer(datasource, null, {
                    iconOptions: {
                        image: "pin-round-darkblue",
                        anchor: "center",
                        allowOverlap: true,
                    },
                    textOptions: {
                        anchor: "top",
                    },
                });
                map.layers.add(resultLayer);
                var pipeline = atlas.service.MapsURL.newPipeline(
                    new atlas.service.MapControlCredential(map)
                );

                // Construct the SearchURL object
                var searchURL = new atlas.service.SearchURL(pipeline);

                //Create a jQuery autocomplete UI widget.
                $("#queryTbx")
                    .autocomplete({
                        minLength: 3, //Don't ask for suggestions until atleast 3 characters have been typed. This will reduce costs by not making requests that will likely not have much relevance.
                        source: function (request, response) {
                            var center = map.getCamera().center;

                            //Create a URL to the Azure Maps search service to perform the search.
                            var requestUrl = geocodeServiceUrlTemplate
                                .replace("{query}", encodeURIComponent(request.term))
                                .replace("{searchType}", "fuzzy")
                                .replace("{language}", "en-US")
                                .replace("{lon}", center[0]) //Use a lat and lon value of the center the map to bais the results to the current map view.
                                .replace("{lat}", center[1])
                                .replace("{countrySet}", "IN"); //A comma seperated string of country codes to limit the suggestions to.

                            processRequest(requestUrl).then((data) => {
                                response(data.results);
                            });
                        },
                        select: function (event, ui) {
                            //Remove any previous added data from the map.
                            datasource.clear();
                            lat = ui.item.position.lat;
                            lon = ui.item.position.lon;
                            //Create a point feature to mark the selected location.
                            datasource.add(
                                new atlas.data.Feature(
                                    new atlas.data.Point([
                                        ui.item.position.lon,
                                        ui.item.position.lat,
                                    ]),
                                    ui.item
                                )
                            );

                            //Zoom the map into the selected location.
                            map.setCamera({
                                bounds: [
                                    ui.item.viewport.topLeftPoint.lon,
                                    ui.item.viewport.btmRightPoint.lat,
                                    ui.item.viewport.btmRightPoint.lon,
                                    ui.item.viewport.topLeftPoint.lat,
                                ],
                                padding: 30,
                            });

                            //Use MapControlCredential to share authentication between a map control and the service module.

                            var query = "gym";
                            var radius = 9000;

                            searchURL
                                .searchPOI(atlas.service.Aborter.timeout(10000), query, {
                                    limit: 10,
                                    lat: lat,
                                    lon: lon,
                                    radius: radius,
                                    view: "Auto",
                                })
                                .then((results) => {
                                    // Extract GeoJSON feature collection from the response and add it to the datasource
                                    var data = results.geojson.getFeatures();
                                    datasource.add(data);
                                });
                            // Create a popup but leave it closed so we can update it and display it later.
                            popup = new atlas.Popup();

                            //Add a mouse over event to the result layer and display a popup when this event fires.
                            map.events.add("mouseover", resultLayer, showPopup);
                            function showPopup(e) {
                                //Get the properties and coordinates of the first shape that the event occurred on.

                                var p = e.shapes[0].getProperties();
                                var position = e.shapes[0].getCoordinates();

                                //Create HTML from properties of the selected result.
                                var html = `
      <div style="padding:5px">
        <div><b>${p.poi.name}</b></div>
        <div>${p.address.freeformAddress}</div>
        <div>${position[1]}, ${position[0]}</div>
      </div>`;

                                //Update the content and position of the popup.
                                popup.setPopupOptions({
                                    content: html,
                                    position: position,
                                });

                                //Open the popup.
                                popup.open(map);
                            }
                        },
                    })
                    .autocomplete("instance")._renderItem = function (ul, item) {
                        //Format the displayed suggestion to show the formatted suggestion string.
                        var suggestionLabel = item.address.freeformAddress;

                        if (item.poi && item.poi.name) {
                            suggestionLabel = item.poi.name + " (" + suggestionLabel + ")";
                        }

                        return $("<li>")
                            .append("<a>" + suggestionLabel + "</a>")
                            .appendTo(ul);
                    };
            });
        }

        function processRequest(url) {
            //This is a reusable function that sets the Azure Maps platform domain, sings the request, and makes use of any transformRequest set on the map.
            return new Promise((resolve, reject) => {
                //Replace the domain placeholder to ensure the same Azure Maps cloud is used throughout the app.
                url = url.replace("{azMapsDomain}", atlas.getDomain());

                //Get the authentication details from the map for use in the request.
                var requestParams = map.authentication.signRequest({ url: url });

                //Transform the request.
                var transform = map.getServiceOptions().transformRequest;
                if (transform) {
                    requestParams = transform(url);
                }

                fetch(requestParams.url, {
                    method: "GET",

                    headers: new Headers(requestParams.headers),
                })
                    .then(
                        (r) => r.json(),
                        (e) => reject(e)
                    )
                    .then(
                        (r) => {
                            resolve(r);
                        },
                        (e) => reject(e)
                    );
            });
        }