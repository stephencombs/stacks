import ExpoModulesCore
import MapKit

public class AppleMapsSearchModule: Module {
  private var activeSearch: MKLocalSearch?

  public func definition() -> ModuleDefinition {
    Name("AppleMapsSearch")

    AsyncFunction("searchCasinos") { (query: String, lat: Double?, lng: Double?, promise: Promise) in
      let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)

      if trimmed.isEmpty && (lat == nil || lng == nil) {
        promise.resolve([])
        return
      }

      let request = MKLocalSearch.Request()
      request.naturalLanguageQuery = trimmed.isEmpty ? "casino" : trimmed
      request.resultTypes = .pointOfInterest

      if let lat = lat, let lng = lng {
        let center = CLLocationCoordinate2D(latitude: lat, longitude: lng)
        if CLLocationCoordinate2DIsValid(center) {
          let spanMeters: CLLocationDistance = trimmed.isEmpty ? 50_000 : 120_000
          request.region = MKCoordinateRegion(
            center: center,
            latitudinalMeters: spanMeters,
            longitudinalMeters: spanMeters
          )
        }
      }

      DispatchQueue.main.async { [weak self] in
        self?.activeSearch?.cancel()
        let search = MKLocalSearch(request: request)
        self?.activeSearch = search

        search.start { response, error in
          if let mkError = error as? MKError,
             mkError.code == .placemarkNotFound || mkError.code == .directionsNotFound {
            promise.resolve([])
            return
          }

          if let nsError = error as NSError?,
             nsError.domain == MKError.errorDomain && nsError.code == MKError.Code.placemarkNotFound.rawValue {
            promise.resolve([])
            return
          }

          if error != nil && response == nil {
            promise.resolve([])
            return
          }

          let items = response?.mapItems.prefix(20) ?? []
          let results: [[String: Any]] = items.compactMap { item in
            guard let rawName = item.name?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !rawName.isEmpty else {
              return nil
            }

            let coord = item.placemark.coordinate
            guard CLLocationCoordinate2DIsValid(coord) else {
              return nil
            }

            let name = String(rawName.prefix(80))
            let rawCity = (item.placemark.locality ?? item.placemark.subAdministrativeArea)?
              .trimmingCharacters(in: .whitespacesAndNewlines)
            let city = rawCity.flatMap { $0.isEmpty ? nil : String($0.prefix(80)) }

            let rawRegion = item.placemark.administrativeArea?
              .trimmingCharacters(in: .whitespacesAndNewlines)
            let region = rawRegion.flatMap { $0.isEmpty ? nil : String($0.prefix(80)) }

            let rawCountry = item.placemark.isoCountryCode?
              .trimmingCharacters(in: .whitespacesAndNewlines)
              .uppercased()
            let country = rawCountry.flatMap { $0.count == 2 ? $0 : nil }

            return [
              "name": name,
              "city": city ?? NSNull(),
              "region": region ?? NSNull(),
              "country": country ?? NSNull(),
              "lat": coord.latitude,
              "lng": coord.longitude,
            ]
          }

          promise.resolve(results)
        }
      }
    }
  }
}
