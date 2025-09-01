type TextareaProps = {
  handler?: (t: string) => void;
};

const Textarea = (props: TextareaProps) => {
  return (
    <textarea
      onChange={(e) => {
        props.handler?.(e.target.value);
      }}
      className="my-textarea"
      placeholder="Enter text here"
      style={{ width: "100%", height: "200px" }}
    ></textarea>
  );
};

export default Textarea;
