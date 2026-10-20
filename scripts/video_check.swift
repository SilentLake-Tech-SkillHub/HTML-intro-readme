// Full decode, timestamp validation and scene frame extraction on macOS.
import Foundation
import AVFoundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 4 else { fatalError("Usage: checker input manifest output-dir") }
let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[2]))) as! [String:Any]
let directory = URL(fileURLWithPath: args[3], isDirectory: true)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
guard let track = asset.tracks(withMediaType: .video).first else { fatalError("Missing video track") }
let fps = (manifest["fps"] as! NSNumber).doubleValue
let expected = (manifest["frames"] as! NSNumber).intValue
let duration = CMTimeGetSeconds(asset.duration)
let reader = try AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA])
reader.add(output)
guard reader.startReading() else { fatalError("Cannot decode: \(String(describing: reader.error))") }
var count = 0, previous = -1.0, regular = true
var timestamps = [CMTime]()
while let sample = output.copyNextSampleBuffer() {
    let timestamp = CMSampleBufferGetPresentationTimeStamp(sample)
    timestamps.append(timestamp)
    let time = CMTimeGetSeconds(timestamp)
    if abs(time - Double(count)/fps) > 0.001 || time <= previous { regular = false }
    previous = time; count += 1
}
guard reader.status == .completed, count == expected, regular,
      abs(duration - Double(expected)/fps) < 0.002,
      abs(Double(track.nominalFrameRate)-fps) < 0.01,
      Int(track.naturalSize.width) == (manifest["width"] as! NSNumber).intValue,
      Int(track.naturalSize.height) == (manifest["height"] as! NSNumber).intValue,
      asset.tracks(withMediaType: .audio).isEmpty else { fatalError("Video validation failed") }
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
let samples = manifest["samples"] as! [[String:Any]]
for (index, sample) in samples.enumerated() {
    let indexInVideo = (sample["frame"] as! NSNumber).int64Value
    guard indexInVideo >= 0 && indexInVideo < timestamps.count else { fatalError("Invalid sample frame index") }
    let frame = try generator.copyCGImage(at: timestamps[Int(indexInVideo)], actualTime: nil)
    let url = directory.appendingPathComponent(String(format:"scene-%03d.png",index+1))
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
        fatalError("Cannot create sample image")
    }
    CGImageDestinationAddImage(destination, frame, nil)
    guard CGImageDestinationFinalize(destination) else { fatalError("Cannot write sample image") }
}
let report: [String:Any] = ["passed":true,"decodeCompleted":true,"frames":count,"fps":track.nominalFrameRate,
    "duration":duration,"width":track.naturalSize.width,"height":track.naturalSize.height,
    "timestampsRegular":regular,"audioTracks":0,"sampledScenes":samples.count,"visualReview":"pending"]
let data = try JSONSerialization.data(withJSONObject: report, options:[.prettyPrinted,.sortedKeys])
try data.write(to:directory.appendingPathComponent("validation.json"))
print(String(data:data,encoding:.utf8)!)
